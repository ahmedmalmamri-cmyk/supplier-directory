import { Router, type IRouter } from "express";
import {
  ApplyAdminSupplierTaxonomyLegacyMappingBody,
  ApplyAdminSupplierTaxonomyLegacyMappingParams,
  ApplyAdminSupplierTaxonomyLegacyMappingResponse,
  BulkCreateAdminSupplierTaxonomyItemsBody,
  BulkCreateAdminSupplierTaxonomyItemsResponse,
  BulkCreateAdminSupplierTaxonomyNodesBody,
  BulkCreateAdminSupplierTaxonomyNodesResponse,
  CreateAdminSupplierTaxonomyItemBody,
  CreateAdminSupplierTaxonomyItemResponse,
  CreateAdminSupplierTaxonomyNodeBody,
  CreateAdminSupplierTaxonomyNodeResponse,
  DeleteAdminSupplierTaxonomyItemBody,
  DeleteAdminSupplierTaxonomyItemParams,
  DeleteAdminSupplierTaxonomyItemResponse,
  DeleteAdminSupplierTaxonomyNodeBody,
  DeleteAdminSupplierTaxonomyNodeParams,
  DeleteAdminSupplierTaxonomyNodeResponse,
  ExportAdminSupplierTaxonomyCsvResponse,
  ExportAdminSupplierTaxonomyItemsCsvResponse,
  GetAdminSupplierTaxonomyAuditResponse,
  GetAdminSupplierTaxonomyTreeResponse,
  ListAdminSupplierTaxonomyItemsQueryParams,
  ListAdminSupplierTaxonomyItemsResponse,
  ListAdminSupplierTaxonomyLegacyReviewResponse,
  MoveAdminSupplierTaxonomyItemBody,
  MoveAdminSupplierTaxonomyItemParams,
  MoveAdminSupplierTaxonomyItemResponse,
  MoveAdminSupplierTaxonomyNodeBody,
  MoveAdminSupplierTaxonomyNodeParams,
  MoveAdminSupplierTaxonomyNodeResponse,
  ReorderAdminSupplierTaxonomyNodesBody,
  ReorderAdminSupplierTaxonomyNodesResponse,
  SetAdminSupplierTaxonomyItemSuppliersBody,
  SetAdminSupplierTaxonomyItemSuppliersParams,
  SetAdminSupplierTaxonomyItemSuppliersResponse,
  UpdateAdminSupplierTaxonomyItemBody,
  UpdateAdminSupplierTaxonomyItemParams,
  UpdateAdminSupplierTaxonomyItemResponse,
  UpdateAdminSupplierTaxonomyNodeBody,
  UpdateAdminSupplierTaxonomyNodeParams,
  UpdateAdminSupplierTaxonomyNodeResponse,
} from "@workspace/api-zod";
import { directoryDb } from "../lib/directory-db";
import { authenticatedAdminId, requireAdmin } from "../lib/admin-auth";
import {
  csvCell,
  legacyMappingConflict,
  planUniqueTrimmedNames,
  transferTaxonomyRoot,
  wouldCreateTaxonomyCycle,
} from "../lib/supplier-taxonomy-utils";

const router: IRouter = Router();

type NodeRow = {
  id: number;
  parentId: number | null;
  name: string;
  icon: string;
  description: string | null;
  displayOrder: number;
  isActive: number;
  itemCount: number;
};

type TaxonomyNode = Omit<NodeRow, "isActive"> & {
  isActive: boolean;
  children: TaxonomyNode[];
};

type ItemRow = {
  id: number;
  name: string;
  categoryId: number;
  categoryPath: string;
  categories: Array<{ id: number; name: string; path: string; isPrimary: boolean }>;
  isActive: boolean;
  notes: string | null;
  supplierCount: number;
  supplierIds: number[];
  createdAt: string;
  updatedAt: string;
};

type ItemDbRow = Omit<ItemRow, "categoryPath" | "categories" | "supplierIds" | "isActive"> & {
  isActive: number;
  supplierIdsJson: string | null;
};

const nodeSelect = `
  SELECT n.id, n.parent_id AS parentId, n.name, n.icon, n.description,
    n.display_order AS displayOrder, n.is_active AS isActive,
    (SELECT COUNT(*) FROM items_categories ic WHERE ic.category_id = n.id) AS itemCount
  FROM supplier_taxonomy_nodes n
`;

const itemSelect = `
  SELECT i.id, i.name, i.category_id AS categoryId, i.is_active AS isActive,
    i.notes, i.created_at AS createdAt, i.updated_at AS updatedAt,
    (SELECT COUNT(*) FROM supplier_taxonomy_item_suppliers l WHERE l.item_id = i.id) AS supplierCount,
    (SELECT json_group_array(supplier_id) FROM (
      SELECT supplier_id FROM supplier_taxonomy_item_suppliers WHERE item_id = i.id ORDER BY supplier_id
    )) AS supplierIdsJson
  FROM supplier_taxonomy_items i
`;

function getNode(id: number): NodeRow | undefined {
  return directoryDb.prepare(`${nodeSelect} WHERE n.id = ?`).get(id) as NodeRow | undefined;
}

function formatNode(row: NodeRow): TaxonomyNode {
  return { ...row, isActive: Boolean(row.isActive), children: [] };
}

function buildTree(parentId: number | null, ancestors: ReadonlySet<number> = new Set()): TaxonomyNode[] {
  const rows = directoryDb.prepare(`
    ${nodeSelect}
    WHERE n.parent_id IS ${parentId === null ? "NULL" : "?"}
    ORDER BY n.display_order, n.id
  `).all(...(parentId === null ? [] : [parentId])) as NodeRow[];
  return rows.map((row) => {
    const node = formatNode(row);
    node.children = ancestors.has(row.id) ? [] : buildTree(row.id, new Set([...ancestors, row.id]));
    return node;
  });
}

function getSubtreeIds(rootId: number): number[] {
  return (directoryDb.prepare(`
    WITH RECURSIVE descendants(id) AS (
      SELECT id FROM supplier_taxonomy_nodes WHERE id = ?
      UNION
      SELECT n.id FROM supplier_taxonomy_nodes n JOIN descendants d ON n.parent_id = d.id
    )
    SELECT id FROM descendants
  `).all(rootId) as Array<{ id: number }>).map(({ id }) => id);
}

function getCategoryPath(categoryId: number): string {
  const byId = new Map<number, { id: number; name: string; parentId: number | null }>();
  const rows = directoryDb.prepare(`
    SELECT id, name, parent_id AS parentId FROM supplier_taxonomy_nodes
  `).all() as Array<{ id: number; name: string; parentId: number | null }>;
  rows.forEach((row) => byId.set(row.id, row));
  const segments: string[] = [];
  const visited = new Set<number>();
  let current = byId.get(categoryId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    segments.unshift(current.name);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return segments.join(" / ");
}

function formatItem(row: ItemDbRow): ItemRow {
  let supplierIds: number[] = [];
  try {
    supplierIds = row.supplierIdsJson ? JSON.parse(row.supplierIdsJson) as number[] : [];
  } catch {
    throw new Error(`Invalid supplier links JSON for taxonomy item ${row.id}.`);
  }
  const links = directoryDb.prepare(`
    SELECT ic.category_id AS id, n.name, ic.is_primary AS isPrimary
    FROM items_categories ic
    JOIN supplier_taxonomy_nodes n ON n.id = ic.category_id
    WHERE ic.item_id = ?
    ORDER BY ic.is_primary DESC, n.name, n.id
  `).all(row.id) as Array<{ id: number; name: string; isPrimary: number }>;
  return {
    id: row.id,
    name: row.name,
    categoryId: row.categoryId,
    categoryPath: getCategoryPath(row.categoryId),
    categories: links.map(link => ({
      id: link.id, name: link.name, path: getCategoryPath(link.id), isPrimary: Boolean(link.isPrimary),
    })),
    isActive: Boolean(row.isActive),
    notes: row.notes,
    supplierCount: row.supplierCount,
    supplierIds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function resolveItemCategories(data: {
  categoryId?: number; categoryIds?: number[]; primaryCategoryId?: number;
}, existing?: ItemRow): { primaryId: number; categoryIds: number[] } | null {
  const primaryId = data.primaryCategoryId ?? data.categoryId ?? existing?.categoryId;
  const categoryIds = data.categoryIds ?? (existing
    ? [...new Set([...existing.categories.map(category => category.id), ...(primaryId ? [primaryId] : [])])]
    : primaryId ? [primaryId] : []);
  if (!primaryId || !categoryIds.length || new Set(categoryIds).size !== categoryIds.length ||
      !categoryIds.includes(primaryId) || categoryIds.some(id => !getNode(id))) return null;
  return { primaryId, categoryIds };
}

function saveItemCategories(itemId: number, categoryIds: number[], primaryId: number, now: string) {
  const insert = directoryDb.prepare(`
    INSERT OR IGNORE INTO items_categories (item_id, category_id, is_primary, created_at)
    VALUES (?, ?, 0, ?)
  `);
  categoryIds.forEach(id => insert.run(itemId, id, now));
  directoryDb.prepare("UPDATE items_categories SET is_primary = 0 WHERE item_id = ?").run(itemId);
  directoryDb.prepare("UPDATE items_categories SET is_primary = 1 WHERE item_id = ? AND category_id = ?")
    .run(itemId, primaryId);
  directoryDb.prepare("UPDATE supplier_taxonomy_items SET category_id = ?, updated_at = ? WHERE id = ?")
    .run(primaryId, now, itemId);
  directoryDb.prepare(`
    DELETE FROM items_categories
    WHERE item_id = ? AND category_id NOT IN (${categoryIds.map(() => "?").join(",")})
  `).run(itemId, ...categoryIds);
}

function getItem(id: number): ItemRow | undefined {
  const row = directoryDb.prepare(`${itemSelect} WHERE i.id = ?`).get(id) as ItemDbRow | undefined;
  return row ? formatItem(row) : undefined;
}

function audit(req: Parameters<typeof requireAdmin>[0], action: string, entityType: "category" | "item" | "legacy-item", entityId: number | null, details: unknown) {
  const adminId = authenticatedAdminId(req);
  if (adminId === null) throw new Error("Authenticated admin identity is unavailable.");
  const createdAt = new Date().toISOString();
  directoryDb.prepare(`
    INSERT INTO supplier_taxonomy_audit_log (admin_id, action, entity_id, entity_type, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(adminId, action, entityId, entityType, JSON.stringify(details), createdAt);
  req.log.info({ adminId, action, entityType, entityId }, "Supplier taxonomy change recorded");
}

const safeAuditDetailKeys = new Set([
  "parentId", "categoryId", "isActive", "before", "after", "deletedNodeIds",
  "consideredNodeIds", "strategy", "transferToNodeId", "affectedItems", "transferredChildIds",
  "deletedNodeCount", "supplierLinkCount", "orderedIds", "item", "itemId", "legacyId",
  "sourceLinksPreserved", "id", "supplierCount", "migrationName",
  "addedNodeIds", "updatedRootIds",
]);

function sanitizeAuditValue(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => sanitizeAuditValue(entry)).filter((entry) => entry !== undefined);
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (!safeAuditDetailKeys.has(key)) continue;
      const safeEntry = sanitizeAuditValue(entry, key);
      if (safeEntry !== undefined) output[key] = safeEntry;
    }
    return output;
  }
  if (typeof value === "string") {
    if (key === "strategy" && (value === "cascade" || value === "transfer")) return value;
    if (key === "migrationName" && value === "supplier-taxonomy-proposal-v2-items") return value;
    return undefined;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return undefined;
}

function safeAuditDetails(rawDetails: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(rawDetails);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { parseError: true };
    }
    return sanitizeAuditValue(parsed) as Record<string, unknown>;
  } catch {
    return { parseError: true };
  }
}

function mutationAction(isMove: boolean, wasActive: boolean, willBeActive: boolean) {
  const deactivated = wasActive && !willBeActive;
  if (isMove && deactivated) return "move-deactivate";
  if (isMove) return "move";
  if (deactivated) return "deactivate";
  if (!wasActive && willBeActive) return "activate";
  return "update";
}

function siblingNameExists(name: string, parentId: number | null, excludingId?: number) {
  return Boolean(directoryDb.prepare(`
    SELECT id FROM supplier_taxonomy_nodes
    WHERE name = ? AND parent_id IS ? AND (? IS NULL OR id != ?)
  `).get(name, parentId, excludingId ?? null, excludingId ?? null));
}

function itemReviewRow(legacyId: number) {
  const row = directoryDb.prepare(`
    SELECT c.id AS legacyId, c.name AS legacyName, c.group_name AS legacyGroupName,
      c.parent_id AS legacyParentId,
      (SELECT COUNT(*) FROM supplier_categories sc WHERE sc.item_category_id = c.id) AS supplierCount,
      m.taxonomy_item_id AS mappedItemId, m.reviewed_at AS reviewedAt
    FROM item_categories c
    LEFT JOIN supplier_taxonomy_legacy_item_mappings m ON m.legacy_item_category_id = c.id
    WHERE c.id = ?
  `).get(legacyId) as {
    legacyId: number;
    legacyName: string;
    legacyGroupName: string;
    legacyParentId: number | null;
    supplierCount: number;
    mappedItemId: number | null;
    reviewedAt: string | null;
  } | undefined;
  if (!row) return undefined;
  const matchingItems = directoryDb.prepare(
    "SELECT id FROM supplier_taxonomy_items WHERE name = ? ORDER BY id",
  ).all(row.legacyName) as Array<{ id: number }>;
  return { ...row, suggestedItemId: matchingItems.length === 1 ? matchingItems[0].id : null };
}

router.get("/admin/supplier-taxonomy/tree", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  res.json(GetAdminSupplierTaxonomyTreeResponse.parse(buildTree(null)));
});

router.get("/admin/supplier-taxonomy/audit", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const rows = directoryDb.prepare(`
    SELECT id, admin_id AS adminId, action, entity_type AS entityType,
      entity_id AS entityId, details, created_at AS createdAt
    FROM supplier_taxonomy_audit_log
    ORDER BY created_at DESC, id DESC
    LIMIT 200
  `).all() as Array<{
    id: number;
    adminId: number | null;
    action: string;
    entityType: string;
    entityId: number | null;
    details: string;
    createdAt: string;
  }>;
  const safeRows = rows.map((row) => ({
    id: row.id,
    adminId: row.adminId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    details: safeAuditDetails(row.details),
    createdAt: row.createdAt,
  }));
  res.json(GetAdminSupplierTaxonomyAuditResponse.parse(safeRows));
});

router.post("/admin/supplier-taxonomy/nodes", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const parsed = CreateAdminSupplierTaxonomyNodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const name = parsed.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "اسم التصنيف مطلوب." });
    return;
  }
  const parentId = parsed.data.parentId ?? null;
  if (parentId !== null && !getNode(parentId)) {
    res.status(400).json({ error: "المجموعة الأب غير موجودة." });
    return;
  }
  if (siblingNameExists(name, parentId)) {
    res.status(409).json({ error: "يوجد تصنيف بهذا الاسم ضمن المجموعة نفسها." });
    return;
  }
  const now = new Date().toISOString();
  try {
    const result = directoryDb.prepare(`
      INSERT INTO supplier_taxonomy_nodes
        (parent_id, name, icon, description, display_order, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(parentId, name, parsed.data.icon?.trim() || "📦", parsed.data.description ?? null,
      parsed.data.displayOrder ?? 0, parsed.data.isActive === false ? 0 : 1, now, now);
    const id = Number(result.lastInsertRowid);
    audit(req, "create", "category", id, { parentId, name });
    res.status(201).json(CreateAdminSupplierTaxonomyNodeResponse.parse(formatNode(getNode(id)!)));
  } catch (error) {
    req.log.error({ err: error }, "Could not create supplier taxonomy category");
    res.status(500).json({ error: "تعذر إنشاء التصنيف." });
  }
});

router.post("/admin/supplier-taxonomy/nodes/bulk", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const parsed = BulkCreateAdminSupplierTaxonomyNodesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const names = parsed.data.nodes.map((node) => node.name.trim());
  const seen = new Set<string>();
  for (const [index, node] of parsed.data.nodes.entries()) {
    if (!names[index]) {
      res.status(400).json({ error: "اسم التصنيف مطلوب." });
      return;
    }
    const parentId = node.parentId ?? null;
    if (parentId !== null && !getNode(parentId)) {
      res.status(400).json({ error: `المجموعة الأب غير موجودة للتصنيف ${names[index]}.` });
      return;
    }
    const duplicateKey = `${parentId ?? "root"}\u0000${names[index]}`;
    if (seen.has(duplicateKey) || siblingNameExists(names[index], parentId)) {
      res.status(409).json({ error: `يوجد تصنيف مكرر ضمن المجموعة نفسها: ${names[index]}` });
      return;
    }
    seen.add(duplicateKey);
  }
  const now = new Date().toISOString();
  const inserted: number[] = [];
  directoryDb.exec("BEGIN");
  try {
    const insert = directoryDb.prepare(`
      INSERT INTO supplier_taxonomy_nodes
        (parent_id, name, icon, description, display_order, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    parsed.data.nodes.forEach((node, index) => {
      const result = insert.run(node.parentId ?? null, names[index], node.icon?.trim() || "📦",
        node.description ?? null, node.displayOrder ?? index + 1, node.isActive === false ? 0 : 1, now, now);
      inserted.push(Number(result.lastInsertRowid));
    });
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not bulk create taxonomy categories");
    res.status(500).json({ error: "تعذر إدراج قائمة التصنيفات." });
    return;
  }
  inserted.forEach((id, index) => audit(req, "bulk-create", "category", id, {
    name: names[index], parentId: parsed.data.nodes[index].parentId ?? null,
  }));
  res.status(201).json(BulkCreateAdminSupplierTaxonomyNodesResponse.parse(
    inserted.map((id) => formatNode(getNode(id)!)),
  ));
});

function updateNode(req: Parameters<typeof requireAdmin>[0], res: Parameters<typeof requireAdmin>[1], id: number, data: {
  parentId?: number | null;
  name?: string;
  icon?: string;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}) {
  const existing = getNode(id);
  if (!existing) {
    res.status(404).json({ error: "التصنيف غير موجود." });
    return;
  }
  const parentId = data.parentId === undefined ? existing.parentId : data.parentId;
  if (parentId !== null && !getNode(parentId)) {
    res.status(400).json({ error: "المجموعة الأب غير موجودة." });
    return;
  }
  if (wouldCreateTaxonomyCycle(id, parentId, getSubtreeIds(id))) {
    res.status(400).json({ error: "لا يمكن نقل التصنيف إلى نفسه أو إلى أحد أبنائه." });
    return;
  }
  const name = data.name === undefined ? existing.name : data.name.trim();
  if (!name) {
    res.status(400).json({ error: "اسم التصنيف مطلوب." });
    return;
  }
  if (siblingNameExists(name, parentId, id)) {
    res.status(409).json({ error: "يوجد تصنيف بهذا الاسم ضمن المجموعة نفسها." });
    return;
  }
  directoryDb.prepare(`
    UPDATE supplier_taxonomy_nodes SET parent_id = ?, name = ?, icon = ?, description = ?,
      display_order = ?, is_active = ?, updated_at = ? WHERE id = ?
  `).run(parentId, name, data.icon?.trim() || existing.icon,
    data.description === undefined ? existing.description : data.description,
    data.displayOrder ?? existing.displayOrder,
    data.isActive === undefined ? existing.isActive : data.isActive ? 1 : 0,
    new Date().toISOString(), id);
  audit(req, mutationAction(
    parentId !== existing.parentId,
    Boolean(existing.isActive),
    data.isActive ?? Boolean(existing.isActive),
  ), "category", id, {
    before: { parentId: existing.parentId, name: existing.name },
    after: { parentId, name },
  });
  res.json(UpdateAdminSupplierTaxonomyNodeResponse.parse(formatNode(getNode(id)!)));
}

router.patch("/admin/supplier-taxonomy/nodes/:id", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const params = UpdateAdminSupplierTaxonomyNodeParams.safeParse(req.params);
  const parsed = UpdateAdminSupplierTaxonomyNodeBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: !params.success ? params.error.message : !parsed.success ? parsed.error.message : "بيانات غير صالحة." });
    return;
  }
  updateNode(req, res, params.data.id, parsed.data);
});

router.post("/admin/supplier-taxonomy/nodes/:id/move", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const params = MoveAdminSupplierTaxonomyNodeParams.safeParse(req.params);
  const parsed = MoveAdminSupplierTaxonomyNodeBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: !params.success ? params.error.message : !parsed.success ? parsed.error.message : "بيانات غير صالحة." });
    return;
  }
  updateNode(req, res, params.data.id, { parentId: parsed.data.parentId });
});

router.post("/admin/supplier-taxonomy/nodes/:id/delete", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const params = DeleteAdminSupplierTaxonomyNodeParams.safeParse(req.params);
  const parsed = DeleteAdminSupplierTaxonomyNodeBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: !params.success ? params.error.message : !parsed.success ? parsed.error.message : "بيانات غير صالحة." });
    return;
  }
  const root = getNode(params.data.id);
  if (!root) {
    res.status(404).json({ error: "التصنيف غير موجود." });
    return;
  }
  if (!parsed.data.confirmed) {
    res.status(400).json({ error: "تأكيد الحذف مطلوب." });
    return;
  }
  const ids = getSubtreeIds(root.id);
  const placeholders = ids.map(() => "?").join(",");
  const itemCount = (directoryDb.prepare(`
    SELECT COUNT(DISTINCT item_id) AS count FROM items_categories WHERE category_id IN (${placeholders})
  `).get(...ids) as { count: number }).count;
  const oldNodeLinkCount = (directoryDb.prepare(`
    SELECT COUNT(*) AS count FROM supplier_taxonomy_supplier_links WHERE node_id IN (${placeholders})
  `).get(...ids) as { count: number }).count;
  const primaryItems = directoryDb.prepare(`
    SELECT id, name FROM supplier_taxonomy_items WHERE category_id IN (${placeholders})
  `).all(...ids) as Array<{ id: number; name: string }>;
  const replacementId = parsed.data.strategy === "transfer"
    ? parsed.data.transferToNodeId : parsed.data.replacementPrimaryCategoryId;
  if (primaryItems.length && (!replacementId || ids.includes(replacementId) || !getNode(replacementId))) {
    res.status(409).json({ error: "اختر قسماً أساسياً بديلاً خارج الأقسام التي ستحذف؛ ستبقى الأصناف محفوظة." });
    return;
  }
  if (parsed.data.strategy === "transfer") {
    const targetId = parsed.data.transferToNodeId;
    if (!targetId || ids.includes(targetId) || !getNode(targetId)) {
      res.status(400).json({ error: "اختر تصنيف نقل موجوداً خارج الشجرة المحذوفة." });
      return;
    }
    const duplicateChild = directoryDb.prepare(`
      SELECT child.name FROM supplier_taxonomy_nodes child
      JOIN supplier_taxonomy_nodes targetChild ON targetChild.parent_id = ?
        AND targetChild.name = child.name
      WHERE child.parent_id = ? LIMIT 1
    `).get(targetId, root.id) as { name: string } | undefined;
    if (duplicateChild) {
      res.status(409).json({ error: `لا يمكن نقل المجموعة؛ يوجد فرع بالاسم نفسه لدى الوجهة: ${duplicateChild.name}` });
      return;
    }
  } else {
    if (oldNodeLinkCount > 0 && !parsed.data.confirmSupplierLinks) {
      res.status(409).json({ error: "أكد إزالة ارتباطات الموردين المباشرة بهذه الأقسام." });
      return;
    }
  }
  const before = directoryDb.prepare(`
    SELECT DISTINCT i.id, i.name, i.category_id AS categoryId
    FROM supplier_taxonomy_items i JOIN items_categories ic ON ic.item_id = i.id
    WHERE ic.category_id IN (${placeholders}) ORDER BY i.id
  `).all(...ids) as Array<{ id: number; name: string; categoryId: number }>;
  const rootSupplierIds = (directoryDb.prepare(`
    SELECT supplier_id AS supplierId FROM supplier_taxonomy_supplier_links
    WHERE node_id = ? ORDER BY supplier_id
  `).all(root.id) as Array<{ supplierId: number }>).map(({ supplierId }) => supplierId);
  let deletedNodeCount = ids.length;
  let transferredItemCount = 0;
  let transferredChildIds: number[] = [];
  directoryDb.exec("BEGIN");
  try {
    if (parsed.data.strategy === "transfer" && parsed.data.transferToNodeId) {
      const transfer = transferTaxonomyRoot(
        directoryDb,
        root.id,
        parsed.data.transferToNodeId,
        new Date().toISOString(),
      );
      deletedNodeCount = transfer.deletedNodeCount;
      transferredItemCount = transfer.transferredItemCount;
      transferredChildIds = transfer.transferredChildIds;
    } else {
      if (primaryItems.length && replacementId) {
        const now = new Date().toISOString();
        const insert = directoryDb.prepare(`
          INSERT OR IGNORE INTO items_categories (item_id, category_id, is_primary, created_at)
          VALUES (?, ?, 0, ?)
        `);
        const unset = directoryDb.prepare("UPDATE items_categories SET is_primary = 0 WHERE item_id = ? AND is_primary = 1");
        const set = directoryDb.prepare("UPDATE items_categories SET is_primary = 1 WHERE item_id = ? AND category_id = ?");
        const updateItem = directoryDb.prepare("UPDATE supplier_taxonomy_items SET category_id = ?, updated_at = ? WHERE id = ?");
        for (const item of primaryItems) {
          insert.run(item.id, replacementId, now);
          unset.run(item.id);
          set.run(item.id, replacementId);
          updateItem.run(replacementId, now, item.id);
        }
      }
      directoryDb.prepare(`DELETE FROM supplier_taxonomy_nodes WHERE id IN (${placeholders})`).run(...ids);
    }
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not delete taxonomy category subtree");
    res.status(500).json({ error: "تعذر حذف شجرة التصنيف." });
    return;
  }
  audit(req, parsed.data.strategy === "transfer" ? "delete-transfer" : "delete-links", "category", root.id, {
    deletedNodeIds: parsed.data.strategy === "transfer" ? [root.id] : ids,
    consideredNodeIds: ids,
    strategy: parsed.data.strategy,
    transferToNodeId: parsed.data.transferToNodeId ?? null,
    replacementPrimaryCategoryId: replacementId ?? null,
    affectedItems: parsed.data.strategy === "transfer"
      ? before.filter((item) => item.categoryId === root.id)
      : before,
    transferredChildIds,
    transferredRootSupplierIds: parsed.data.strategy === "transfer" ? rootSupplierIds : [],
    deletedNodeCount,
    supplierLinkCount: oldNodeLinkCount,
  });
  res.json(DeleteAdminSupplierTaxonomyNodeResponse.parse({
    success: true,
    deletedNodeCount,
    transferredItemCount,
  }));
});

router.put("/admin/supplier-taxonomy/order", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const parsed = ReorderAdminSupplierTaxonomyNodesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const ids = parsed.data.orderedIds;
  if (new Set(ids).size !== ids.length) {
    res.status(400).json({ error: "لا يمكن تكرار التصنيف في الترتيب." });
    return;
  }
  const siblings = directoryDb.prepare(`
    SELECT id FROM supplier_taxonomy_nodes WHERE parent_id IS ${parsed.data.parentId === null ? "NULL" : "?"}
  `).all(...(parsed.data.parentId === null ? [] : [parsed.data.parentId])) as Array<{ id: number }>;
  if (siblings.length !== ids.length || siblings.some(({ id }) => !ids.includes(id))) {
    res.status(400).json({ error: "يجب أن يتضمن الترتيب جميع التصنيفات الشقيقة فقط." });
    return;
  }
  const update = directoryDb.prepare("UPDATE supplier_taxonomy_nodes SET display_order = ?, updated_at = ? WHERE id = ?");
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    ids.forEach((id, index) => update.run(index + 1, now, id));
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not reorder taxonomy categories");
    res.status(500).json({ error: "تعذر حفظ الترتيب." });
    return;
  }
  audit(req, "reorder", "category", parsed.data.parentId, { orderedIds: ids });
  res.json(ReorderAdminSupplierTaxonomyNodesResponse.parse({ success: true }));
});

router.get("/admin/supplier-taxonomy/items", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const query = ListAdminSupplierTaxonomyItemsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const predicates: string[] = [];
  const values: Array<string | number> = [];
  if (query.data.categoryId !== undefined) {
    predicates.push(`EXISTS (SELECT 1 FROM items_categories ic WHERE ic.item_id = i.id
      AND ic.category_id = ? ${req.query.primaryOnly === "true" ? "AND ic.is_primary = 1" : ""})`);
    values.push(query.data.categoryId);
  }
  if (query.data.status === "active") predicates.push("i.is_active = 1");
  if (query.data.status === "inactive") predicates.push("i.is_active = 0");
  if (query.data.q?.trim()) {
    predicates.push("i.name LIKE ? ESCAPE '\\'");
    const escaped = query.data.q.trim().replace(/[\\%_]/g, "\\$&");
    values.push(`%${escaped}%`);
  }
  const rows = directoryDb.prepare(`
    ${itemSelect}
    ${predicates.length ? `WHERE ${predicates.join(" AND ")}` : ""}
    ORDER BY i.name COLLATE BINARY, i.id
  `).all(...values) as ItemDbRow[];
  res.json(ListAdminSupplierTaxonomyItemsResponse.parse(rows.map(formatItem)));
});

router.post("/admin/supplier-taxonomy/items", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const parsed = CreateAdminSupplierTaxonomyItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const name = parsed.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "اسم الصنف مطلوب." });
    return;
  }
  const categories = resolveItemCategories(parsed.data);
  if (!categories) {
    res.status(400).json({ error: "اختر الأقسام وحدد قسماً أساسياً بينها." });
    return;
  }
  if (directoryDb.prepare("SELECT id FROM supplier_taxonomy_items WHERE name = ?").get(name)) {
    res.status(409).json({ error: "يوجد صنف بهذا الاسم وبحالة الأحرف نفسها." });
    return;
  }
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    const result = directoryDb.prepare(`
      INSERT INTO supplier_taxonomy_items
        (name, category_id, is_active, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, categories.primaryId, parsed.data.isActive === false ? 0 : 1, parsed.data.notes ?? null, now, now);
    const id = Number(result.lastInsertRowid);
    saveItemCategories(id, categories.categoryIds, categories.primaryId, now);
    audit(req, "create", "item", id, { name, categoryIds: categories.categoryIds, primaryCategoryId: categories.primaryId });
    directoryDb.exec("COMMIT");
    res.status(201).json(CreateAdminSupplierTaxonomyItemResponse.parse(getItem(id)));
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not create taxonomy item");
    res.status(409).json({ error: "تعذر إنشاء الصنف بالاسم المحدد." });
  }
});

router.post("/admin/supplier-taxonomy/items/bulk", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const parsed = BulkCreateAdminSupplierTaxonomyItemsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const prepared = parsed.data.items.map((item) => ({ ...item, name: item.name.trim() }));
  if (prepared.some((item) => !item.name || !resolveItemCategories(item))) {
    res.status(400).json({ error: "تحقق من أسماء الأصناف والتصنيفات المطلوبة." });
    return;
  }
  const existingNames = new Set((directoryDb.prepare("SELECT name FROM supplier_taxonomy_items")
    .all() as Array<{ name: string }>).map((row) => row.name));
  const plan = planUniqueTrimmedNames(prepared.map((item) => item.name), existingNames);
  const accepted = plan.acceptedIndexes.map((index) => prepared[index]);
  const now = new Date().toISOString();
  const createdIds: number[] = [];
  directoryDb.exec("BEGIN");
  try {
    const insert = directoryDb.prepare(`
      INSERT INTO supplier_taxonomy_items
        (name, category_id, is_active, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const item of accepted) {
      const categories = resolveItemCategories(item)!;
      const result = insert.run(item.name, categories.primaryId, item.isActive === false ? 0 : 1, item.notes ?? null, now, now);
      const id = Number(result.lastInsertRowid);
      saveItemCategories(id, categories.categoryIds, categories.primaryId, now);
      createdIds.push(id);
    }
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not bulk insert taxonomy items");
    res.status(500).json({ error: "تعذر حفظ قائمة الأصناف." });
    return;
  }
  accepted.forEach((item, index) => audit(req, "bulk-create", "item", createdIds[index], {
    name: item.name, categoryId: item.categoryId,
  }));
  res.status(201).json(BulkCreateAdminSupplierTaxonomyItemsResponse.parse({
    added: createdIds.length,
    skipped: plan.skipped,
    items: createdIds.map((id) => getItem(id)!),
  }));
});

function updateItem(req: Parameters<typeof requireAdmin>[0], res: Parameters<typeof requireAdmin>[1], id: number, data: {
  name?: string;
  categoryId?: number;
  categoryIds?: number[];
  primaryCategoryId?: number;
  isActive?: boolean;
  notes?: string | null;
}) {
  const existing = getItem(id);
  if (!existing) {
    res.status(404).json({ error: "الصنف غير موجود." });
    return;
  }
  const name = data.name === undefined ? existing.name : data.name.trim();
  const categories = resolveItemCategories(data, existing);
  if (!name || !categories) {
    res.status(400).json({ error: "اسم الصنف والأقسام والقسم الأساسي مطلوبة." });
    return;
  }
  if (directoryDb.prepare("SELECT id FROM supplier_taxonomy_items WHERE name = ? AND id != ?").get(name, id)) {
    res.status(409).json({ error: "يوجد صنف بهذا الاسم وبحالة الأحرف نفسها." });
    return;
  }
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    directoryDb.prepare(`
      UPDATE supplier_taxonomy_items SET name = ?, is_active = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(name, data.isActive === undefined ? (existing.isActive ? 1 : 0) : data.isActive ? 1 : 0,
      data.notes === undefined ? existing.notes : data.notes, now, id);
    saveItemCategories(id, categories.categoryIds, categories.primaryId, now);
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not update taxonomy item categories");
    res.status(500).json({ error: "تعذر تحديث روابط الصنف." });
    return;
  }
  audit(req, mutationAction(
    categories.primaryId !== existing.categoryId,
    existing.isActive,
    data.isActive ?? existing.isActive,
  ), "item", id, {
    before: { name: existing.name, categoryIds: existing.categories.map(category => category.id), primaryCategoryId: existing.categoryId, isActive: existing.isActive },
    after: { name, categoryIds: categories.categoryIds, primaryCategoryId: categories.primaryId, isActive: data.isActive ?? existing.isActive },
  });
  res.json(UpdateAdminSupplierTaxonomyItemResponse.parse(getItem(id)));
}

router.patch("/admin/supplier-taxonomy/items/:id", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const params = UpdateAdminSupplierTaxonomyItemParams.safeParse(req.params);
  const parsed = UpdateAdminSupplierTaxonomyItemBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: !params.success ? params.error.message : !parsed.success ? parsed.error.message : "بيانات غير صالحة." });
    return;
  }
  updateItem(req, res, params.data.id, parsed.data);
});

router.post("/admin/supplier-taxonomy/items/:id/move", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const params = MoveAdminSupplierTaxonomyItemParams.safeParse(req.params);
  const parsed = MoveAdminSupplierTaxonomyItemBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: !params.success ? params.error.message : !parsed.success ? parsed.error.message : "بيانات غير صالحة." });
    return;
  }
  updateItem(req, res, params.data.id, { categoryId: parsed.data.categoryId });
});

router.post("/admin/supplier-taxonomy/items/:id/delete", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const params = DeleteAdminSupplierTaxonomyItemParams.safeParse(req.params);
  const parsed = DeleteAdminSupplierTaxonomyItemBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: !params.success ? params.error.message : !parsed.success ? parsed.error.message : "بيانات غير صالحة." });
    return;
  }
  if (!parsed.data.confirmed) {
    res.status(400).json({ error: "تأكيد حذف الصنف مطلوب." });
    return;
  }
  const existing = getItem(params.data.id);
  if (!existing) {
    res.status(404).json({ error: "الصنف غير موجود." });
    return;
  }
  directoryDb.exec("BEGIN");
  try {
    directoryDb.prepare("DELETE FROM supplier_taxonomy_legacy_item_mappings WHERE taxonomy_item_id = ?").run(existing.id);
    directoryDb.prepare("DELETE FROM supplier_taxonomy_items WHERE id = ?").run(existing.id);
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not delete taxonomy item");
    res.status(500).json({ error: "تعذر حذف الصنف." });
    return;
  }
  audit(req, "delete", "item", existing.id, {
    item: {
      id: existing.id,
      name: existing.name,
      categoryId: existing.categoryId,
      categoryPath: existing.categoryPath,
      isActive: existing.isActive,
      supplierCount: existing.supplierCount,
    },
  });
  res.json(DeleteAdminSupplierTaxonomyItemResponse.parse({ success: true, message: "حُذف الصنف وروابطه بالأقسام." }));
});

router.put("/admin/supplier-taxonomy/items/:id/suppliers", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const params = SetAdminSupplierTaxonomyItemSuppliersParams.safeParse(req.params);
  const parsed = SetAdminSupplierTaxonomyItemSuppliersBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: !params.success ? params.error.message : !parsed.success ? parsed.error.message : "بيانات غير صالحة." });
    return;
  }
  if (!getItem(params.data.id)) {
    res.status(404).json({ error: "الصنف غير موجود." });
    return;
  }
  if (!parsed.data.confirmed) {
    res.status(400).json({ error: "تأكيد استبدال ارتباطات الموردين مطلوب." });
    return;
  }
  const supplierIds = parsed.data.supplierIds;
  if (new Set(supplierIds).size !== supplierIds.length) {
    res.status(400).json({ error: "لا يمكن تكرار المورد." });
    return;
  }
  const missing = supplierIds.find((supplierId) =>
    !directoryDb.prepare("SELECT id FROM suppliers WHERE id = ?").get(supplierId));
  if (missing !== undefined) {
    res.status(404).json({ error: `المورد رقم ${missing} غير موجود.` });
    return;
  }
  const previousSupplierIds = (directoryDb.prepare(`
    SELECT supplier_id AS supplierId FROM supplier_taxonomy_item_suppliers WHERE item_id = ? ORDER BY supplier_id
  `).all(params.data.id) as Array<{ supplierId: number }>).map(({ supplierId }) => supplierId);
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    directoryDb.prepare("DELETE FROM supplier_taxonomy_item_suppliers WHERE item_id = ?").run(params.data.id);
    const insert = directoryDb.prepare(`
      INSERT INTO supplier_taxonomy_item_suppliers (supplier_id, item_id, created_at) VALUES (?, ?, ?)
    `);
    supplierIds.forEach((supplierId) => insert.run(supplierId, params.data.id, now));
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not update item supplier links");
    res.status(500).json({ error: "تعذر تحديث ارتباطات الموردين." });
    return;
  }
  audit(req, "set-suppliers", "item", params.data.id, { previousSupplierIds, supplierIds });
  res.json(SetAdminSupplierTaxonomyItemSuppliersResponse.parse({ itemId: params.data.id, supplierIds }));
});

router.get("/admin/supplier-taxonomy/legacy-review", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const rows = directoryDb.prepare("SELECT id FROM item_categories ORDER BY id").all() as Array<{ id: number }>;
  res.json(ListAdminSupplierTaxonomyLegacyReviewResponse.parse(rows.map(({ id }) => itemReviewRow(id))));
});

router.post("/admin/supplier-taxonomy/legacy-review/:legacyId/apply", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const params = ApplyAdminSupplierTaxonomyLegacyMappingParams.safeParse(req.params);
  const parsed = ApplyAdminSupplierTaxonomyLegacyMappingBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: !params.success ? params.error.message : !parsed.success ? parsed.error.message : "بيانات غير صالحة." });
    return;
  }
  if (!parsed.data.confirmed) {
    res.status(400).json({ error: "تأكيد نسخ ارتباطات الموردين مطلوب." });
    return;
  }
  const legacy = directoryDb.prepare("SELECT id, name FROM item_categories WHERE id = ?")
    .get(params.data.legacyId) as { id: number; name: string } | undefined;
  if (!legacy) {
    res.status(404).json({ error: "الصنف القديم غير موجود." });
    return;
  }
  const target = getItem(parsed.data.itemId);
  if (!target) {
    res.status(404).json({ error: "الصنف الجديد غير موجود." });
    return;
  }
  const priorMapping = directoryDb.prepare(`
    SELECT taxonomy_item_id AS itemId
    FROM supplier_taxonomy_legacy_item_mappings
    WHERE legacy_item_category_id = ?
  `).get(legacy.id) as { itemId: number } | undefined;
  if (legacyMappingConflict(priorMapping?.itemId ?? null, target.id)) {
    res.status(409).json({
      error: "تم ربط هذا الصنف القديم بصنف جديد مختلف مسبقاً؛ يلزم تصحيح الربط صراحةً قبل تغييره.",
      mappedItemId: priorMapping?.itemId,
    });
    return;
  }
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    directoryDb.prepare(`
      INSERT OR IGNORE INTO supplier_taxonomy_item_suppliers (supplier_id, item_id, created_at)
      SELECT supplier_id, ?, ? FROM supplier_categories WHERE item_category_id = ?
    `).run(target.id, now, legacy.id);
    directoryDb.prepare(`
      INSERT INTO supplier_taxonomy_legacy_item_mappings
        (legacy_item_category_id, taxonomy_item_id, reviewed_at)
      VALUES (?, ?, ?)
      ON CONFLICT(legacy_item_category_id) DO UPDATE SET
        taxonomy_item_id = excluded.taxonomy_item_id, reviewed_at = excluded.reviewed_at
    `).run(legacy.id, target.id, now);
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not apply legacy-to-item mapping");
    res.status(500).json({ error: "تعذر تطبيق الربط دون تعديل السجلات القديمة." });
    return;
  }
  audit(req, "legacy-map", "legacy-item", legacy.id, {
    legacyName: legacy.name, itemId: target.id, legacyId: legacy.id, sourceLinksPreserved: true,
  });
  res.json(ApplyAdminSupplierTaxonomyLegacyMappingResponse.parse(itemReviewRow(legacy.id)));
});

router.get("/admin/supplier-taxonomy/export.csv", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const rows = directoryDb.prepare(`${nodeSelect} ORDER BY n.display_order, n.id`).all() as NodeRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const pathFor = (row: NodeRow) => {
    const segments = [row.name];
    let current = row;
    const visited = new Set([row.id]);
    while (current.parentId !== null && !visited.has(current.parentId)) {
      visited.add(current.parentId);
      const parent = byId.get(current.parentId);
      if (!parent) break;
      segments.unshift(parent.name);
      current = parent;
    }
    return segments.join(" / ");
  };
  const lines: unknown[][] = [["id", "parent_id", "name", "path", "icon", "description", "is_active", "display_order", "item_count"]];
  for (const row of rows) {
    lines.push([row.id, row.parentId, row.name, pathFor(row), row.icon, row.description,
      row.isActive ? "true" : "false", row.displayOrder, row.itemCount]);
  }
  const csv = `\uFEFF${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}`;
  res.type("text/csv; charset=utf-8").attachment("supplier-taxonomy-categories.csv")
    .send(ExportAdminSupplierTaxonomyCsvResponse.parse(csv));
});

router.get("/admin/supplier-taxonomy/items/export.csv", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const rows = directoryDb.prepare(`${itemSelect} ORDER BY i.category_id, i.name COLLATE BINARY, i.id`)
    .all() as ItemDbRow[];
  const lines: unknown[][] = [["id", "name", "primary_category_id", "primary_category_path", "category_ids", "category_paths", "is_active", "notes", "supplier_count", "supplier_ids", "created_at", "updated_at"]];
  for (const raw of rows) {
    const item = formatItem(raw);
    lines.push([item.id, item.name, item.categoryId, item.categoryPath,
      item.categories.map(category => category.id).join(";"),
      item.categories.map(category => category.path).join(";"), item.isActive ? "true" : "false",
      item.notes, item.supplierCount, item.supplierIds.join(";"), item.createdAt, item.updatedAt]);
  }
  const csv = `\uFEFF${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}`;
  res.type("text/csv; charset=utf-8").attachment("supplier-taxonomy-items.csv")
    .send(ExportAdminSupplierTaxonomyItemsCsvResponse.parse(csv));
});

export default router;