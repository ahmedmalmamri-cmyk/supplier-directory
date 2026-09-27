import { Router, type IRouter } from "express";
import {
  CreateAdminGroupBody,
  CreateAdminGroupResponse,
  DeleteAdminGroupParams,
  DeleteAdminGroupResponse,
  GetAdminCategoryStatsResponse,
  ListAdminGroupsResponse,
  ListGroupsResponse,
  SetAdminItemCategoryTagsBody,
  SetAdminItemCategoryTagsParams,
  SetAdminItemCategoryTagsResponse,
  UpdateAdminGroupBody,
  UpdateAdminGroupParams,
  UpdateAdminGroupResponse,
} from "@workspace/api-zod";
import { directoryDb } from "../lib/directory-db";
import { isLegacyItemCategoriesRetired } from "../lib/retire-legacy-item-categories";
import {
  categoryTagGroupIdsMap,
  deleteEmptyGroup,
  getAdminCategoryStats,
  getGroupRecord,
  listGroupSummaries,
} from "../lib/item-category-groups";
import { itemCategorySupplierCounts } from "../lib/item-category-supplier-counts";
import { uniqueItemCategorySlug } from "../lib/item-category-slugs";
import { requireAdmin } from "../lib/admin-auth";
import { listPublicSupplierTaxonomyGroups } from "../lib/public-supplier-taxonomy";

const router: IRouter = Router();

router.use("/admin/groups", (req, res, next): void => {
  if (req.method === "GET" || !isLegacyItemCategoriesRetired(directoryDb)) {
    next();
    return;
  }
  if (!requireAdmin(req, res)) return;
  res.status(410).json({ error: "تم إيقاف إدارة المجموعات القديمة. استخدم شجرة تصنيفات الموردين الجديدة." });
});

router.use("/admin/item-categories", (req, res, next): void => {
  if (req.method === "GET" || !isLegacyItemCategoriesRetired(directoryDb)) {
    next();
    return;
  }
  if (!requireAdmin(req, res)) return;
  res.status(410).json({ error: "تم إيقاف إدارة التصنيفات القديمة. استخدم شجرة تصنيفات الموردين الجديدة." });
});

function itemCategoryRow(id: number) {
  const row = directoryDb.prepare(`
    SELECT id, name, icon, slug, group_name AS groupName, parent_id AS parentId,
      primary_group_id AS primaryGroupId, sub_group_id AS subGroupId, description,
      display_on_home AS displayOnHome, display_order AS displayOrder,
      is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
    FROM item_categories WHERE id = ?
  `).get(id) as {
    id: number;
    name: string;
    icon: string;
    slug: string;
    groupName: string;
    parentId: number | null;
    primaryGroupId: number | null;
    subGroupId: number | null;
    description: string | null;
    displayOnHome: number;
    displayOrder: number;
    isActive: number;
    createdAt: string;
    updatedAt: string;
  } | undefined;
  if (!row) return undefined;
  const tagGroupIds = categoryTagGroupIdsMap(false).get(id) ?? [];
  const categories = directoryDb.prepare(`
    SELECT id, name, parent_id AS parentId,
      primary_group_id AS primaryGroupId
    FROM item_categories WHERE is_active = 1
  `).all() as Array<{
    id: number;
    name: string;
    parentId: number | null;
    primaryGroupId: number | null;
  }>;
  const supplierCount = itemCategorySupplierCounts(categories).get(id) ?? 0;
  return {
    ...row,
    primaryGroupId: row.primaryGroupId,
    subGroupId: row.subGroupId,
    tagGroupIds,
    displayOnHome: Boolean(row.displayOnHome),
    isActive: Boolean(row.isActive),
    supplierCount,
  };
}

router.get("/groups", (_req, res): void => {
  res.json(ListGroupsResponse.parse(listPublicSupplierTaxonomyGroups()));
});

router.get("/admin/groups", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  res.json(ListAdminGroupsResponse.parse(listGroupSummaries(true)));
});

router.post("/admin/groups", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const parsed = CreateAdminGroupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, icon, displayOrder, isActive } = parsed.data;
  const parentId = parsed.data.parentId ?? null;
  if (parentId !== null) {
    const parent = getGroupRecord(parentId);
    if (!parent || !parent.isActive || parent.parentId !== null) {
      res.status(400).json({ error: "يجب اختيار مجموعة رئيسية نشطة للأقسام الفرعية." });
      return;
    }
  }
  const duplicate = directoryDb.prepare(`
    SELECT id FROM groups WHERE lower(trim(name)) = lower(?)
    UNION ALL
    SELECT id FROM item_categories WHERE lower(trim(name)) = lower(?)
    LIMIT 1
  `).get(name, name);
  if (duplicate) {
    res.status(409).json({ error: "يوجد تصنيف أو مجموعة بهذا الاسم بالفعل." });
    return;
  }

  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    const id = (directoryDb.prepare(`
      SELECT MAX(id) + 1 AS id FROM (
        SELECT COALESCE(MAX(id), 0) AS id FROM groups
        UNION ALL
        SELECT COALESCE(MAX(id), 0) AS id FROM item_categories
        UNION ALL
        SELECT COALESCE(MAX(id), 0) AS id FROM permanently_deleted_item_categories
      )
    `).get() as { id: number }).id;
    const slug = uniqueItemCategorySlug(name, (candidate) => Boolean(directoryDb.prepare(`
      SELECT 1 FROM groups WHERE slug = ?
      UNION ALL
      SELECT 1 FROM item_categories WHERE slug = ?
      LIMIT 1
    `).get(candidate, candidate)));
    directoryDb.prepare(`
      INSERT INTO groups (id, name, slug, icon, display_order, is_active, parent_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, slug, icon, displayOrder, isActive ? 1 : 0, parentId);
    if (parentId === null) {
      directoryDb.prepare(`
        INSERT INTO item_categories
          (id, name, icon, group_name, parent_id, slug, description,
           display_on_home, display_order, is_active, created_at, updated_at,
           primary_group_id, sub_group_id)
        VALUES (?, ?, ?, ?, NULL, ?, NULL, 1, ?, ?, ?, ?, NULL, NULL)
      `).run(id, name, icon, name, slug, displayOrder, isActive ? 1 : 0, now, now);
    }
    directoryDb.exec("COMMIT");
    const created = listGroupSummaries(true).find((group) => group.id === id)!;
    res.status(201).json(CreateAdminGroupResponse.parse(created));
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not create category group");
    const uniqueConflict = error instanceof Error && error.message.includes("UNIQUE constraint failed");
    res.status(uniqueConflict ? 409 : 500).json({
      error: uniqueConflict
        ? "يوجد تصنيف أو مجموعة بهذا الاسم أو الرابط بالفعل."
        : "تعذر إنشاء المجموعة.",
    });
  }
});

router.patch("/admin/groups/:id", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const params = UpdateAdminGroupParams.safeParse(req.params);
  const parsed = UpdateAdminGroupBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = getGroupRecord(params.data.id);
  if (!existing) {
    res.status(404).json({ error: "المجموعة غير موجودة." });
    return;
  }
  const mirror = existing.parentId === null ? directoryDb.prepare(`
    SELECT id FROM item_categories WHERE id = ? AND parent_id IS NULL
  `).get(existing.id) : true;
  if (!mirror) {
    res.status(404).json({ error: "سجل المجموعة المقابل غير موجود." });
    return;
  }
  const name = parsed.data.name ?? existing.name;
  const icon = parsed.data.icon ?? existing.icon;
  const displayOrder = parsed.data.displayOrder ?? existing.displayOrder;
  const isActive = parsed.data.isActive ?? Boolean(existing.isActive);
  const parentId = parsed.data.parentId === undefined ? existing.parentId : parsed.data.parentId;
  if (existing.parentId === null && parentId !== null) {
    res.status(400).json({ error: "لا يمكن تحويل المجموعة الرئيسية إلى قسم فرعي." });
    return;
  }
  if (existing.parentId !== null && parentId === null) {
    res.status(400).json({ error: "لا يمكن تحويل القسم الفرعي إلى مجموعة رئيسية." });
    return;
  }
  if (parentId !== null) {
    const parent = getGroupRecord(parentId);
    if (!parent || !parent.isActive || parent.parentId !== null) {
      res.status(400).json({ error: "يجب اختيار مجموعة رئيسية نشطة للأقسام الفرعية." });
      return;
    }
  }
  if (existing.isActive && !isActive) {
    const activePrimaryCategory = directoryDb.prepare(`
      SELECT id FROM item_categories
      WHERE ${existing.parentId === null ? "primary_group_id = ?" : "sub_group_id = ?"} AND is_active = 1
      LIMIT 1
    `).get(existing.id);
    if (activePrimaryCategory) {
      res.status(409).json({
        error: "انقل التصنيفات الأساسية النشطة إلى مجموعات أخرى قبل تعطيل هذه المجموعة.",
      });
      return;
    }
  }
  const duplicate = directoryDb.prepare(`
    SELECT id FROM groups WHERE lower(trim(name)) = lower(?) AND id != ?
    UNION ALL
    SELECT id FROM item_categories WHERE lower(trim(name)) = lower(?) AND id != ?
    LIMIT 1
  `).get(name, existing.id, name, existing.id);
  if (duplicate) {
    res.status(409).json({ error: "يوجد تصنيف أو مجموعة بهذا الاسم بالفعل." });
    return;
  }

  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    directoryDb.prepare(`
      UPDATE groups
      SET name = ?, icon = ?, display_order = ?, is_active = ?, parent_id = ?
      WHERE id = ?
    `).run(name, icon, displayOrder, isActive ? 1 : 0, parentId, existing.id);
    if (existing.parentId === null) directoryDb.prepare(`
      UPDATE item_categories
      SET name = ?, icon = ?, group_name = ?, display_order = ?,
        is_active = ?, display_on_home = 1, updated_at = ?
      WHERE id = ?
    `).run(name, icon, name, displayOrder, isActive ? 1 : 0, now, existing.id);
    if (existing.parentId === null && name !== existing.name) {
      directoryDb.prepare(`
        INSERT OR IGNORE INTO item_category_aliases (alias, item_category_id)
        VALUES (?, ?)
      `).run(existing.name, existing.id);
    }
    if (existing.parentId === null) directoryDb.prepare(`
      UPDATE item_categories
      SET group_name = ?, updated_at = ?
      WHERE primary_group_id = ?
    `).run(name, now, existing.id);
    else directoryDb.prepare(`
      UPDATE item_categories
      SET parent_id = ?, primary_group_id = ?, group_name = ?, updated_at = ?
      WHERE sub_group_id = ?
    `).run(parentId, parentId, getGroupRecord(parentId!)?.name ?? "", now, existing.id);
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not update category group");
    res.status(500).json({ error: "تعذر تحديث المجموعة." });
    return;
  }
  const updated = listGroupSummaries(true).find((group) => group.id === existing.id)!;
  res.json(UpdateAdminGroupResponse.parse(updated));
});

router.delete("/admin/groups/:id", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const params = DeleteAdminGroupParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const existing = getGroupRecord(params.data.id);
  if (!existing) {
    res.status(404).json({ error: "المجموعة غير موجودة." });
    return;
  }
  let deletion: ReturnType<typeof deleteEmptyGroup>;
  try {
    deletion = deleteEmptyGroup(existing.id);
  } catch (error) {
    req.log.error({ err: error }, "Could not delete category group");
    res.status(500).json({ error: "تعذر حذف المجموعة." });
    return;
  }
  if (deletion.status === "has-primary-categories") {
    res.status(409).json({ error: "انقل جميع التصنيفات الأساسية، بما فيها غير النشطة، قبل حذف المجموعة." });
    return;
  }
  if (deletion.status === "has-linked-data") {
    const linkedRecords = [
      deletion.supplierCategoryCount && `${deletion.supplierCategoryCount} ارتباط مورد`,
      deletion.productCount && `${deletion.productCount} منتج`,
      deletion.aliasCount && `${deletion.aliasCount} اسم بديل`,
    ].filter(Boolean).join("، ");
    res.status(409).json({
      error: `لا يمكن حذف المجموعة لارتباطها ببيانات قائمة (${linkedRecords}). انقل البيانات أو أزل الارتباطات أولاً.`,
    });
    return;
  }
  res.json(DeleteAdminGroupResponse.parse({ success: true }));
});

router.get("/admin/category-stats", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  res.json(GetAdminCategoryStatsResponse.parse(getAdminCategoryStats()));
});

router.put("/admin/item-categories/:id/tags", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const params = SetAdminItemCategoryTagsParams.safeParse(req.params);
  const parsed = SetAdminItemCategoryTagsBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (new Set(parsed.data.groupIds).size !== parsed.data.groupIds.length) {
    res.status(400).json({ error: "لا يمكن تكرار المجموعة في قائمة الوسوم." });
    return;
  }
  const category = directoryDb.prepare(`
    SELECT id, primary_group_id AS primaryGroupId
    FROM item_categories WHERE id = ?
  `).get(params.data.id) as { id: number; primaryGroupId: number | null } | undefined;
  if (!category) {
    res.status(404).json({ error: "التصنيف غير موجود." });
    return;
  }
  if (category.primaryGroupId === null) {
    res.status(400).json({ error: "يمكن إضافة وسوم للتصنيفات الفرعية فقط." });
    return;
  }
  if (category.primaryGroupId !== null && parsed.data.groupIds.includes(category.primaryGroupId)) {
    res.status(409).json({ error: "المجموعة الأساسية لا يمكن تكرارها كوسم." });
    return;
  }
  for (const groupId of parsed.data.groupIds) {
    const group = getGroupRecord(groupId);
    if (!group) {
      res.status(404).json({ error: "إحدى المجموعات المحددة غير موجودة." });
      return;
    }
    if (!group.isActive) {
      res.status(400).json({ error: "يمكن إضافة وسوم من مجموعات نشطة فقط." });
      return;
    }
  }

  directoryDb.exec("BEGIN");
  try {
    directoryDb.prepare("DELETE FROM category_tags WHERE category_id = ?").run(category.id);
    const insertTag = directoryDb.prepare(`
      INSERT INTO category_tags (category_id, group_id, created_at)
      VALUES (?, ?, ?)
    `);
    const now = new Date().toISOString();
    for (const groupId of parsed.data.groupIds) insertTag.run(category.id, groupId, now);
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not update category group tags");
    res.status(500).json({ error: "تعذر تحديث وسوم التصنيف." });
    return;
  }
  const updated = itemCategoryRow(category.id);
  if (!updated) {
    res.status(404).json({ error: "التصنيف غير موجود." });
    return;
  }
  res.json(SetAdminItemCategoryTagsResponse.parse(updated));
});

export default router;