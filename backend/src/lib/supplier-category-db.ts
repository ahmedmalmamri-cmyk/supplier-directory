import { directoryDb } from "./directory-db";
import { resolveActiveSupplierTaxonomySelections } from "./supplier-taxonomy-assignments";

function parseSelectedCategories(rawCategories: string): string[] {
  try {
    const parsed: unknown = JSON.parse(rawCategories);
    return Array.isArray(parsed)
      ? parsed.filter((name): name is string => typeof name === "string")
      : [];
  } catch {
    return [];
  }
}

function assignmentsFor(rawCategories: string) {
  const assignments = resolveActiveSupplierTaxonomySelections(parseSelectedCategories(rawCategories));
  if (assignments.unresolved.length) {
    throw new Error(
      `لا يمكن ربط التصنيف التالي بالشجرة النشطة: ${assignments.unresolved.join("، ")}.`,
    );
  }
  return assignments;
}

function replaceSupplierTaxonomyAssignments(
  supplierId: number,
  assignments: ReturnType<typeof assignmentsFor>,
  createdAt: string,
) {
  directoryDb.prepare(
    "DELETE FROM supplier_taxonomy_item_suppliers WHERE supplier_id = ?",
  ).run(supplierId);
  directoryDb.prepare(
    "DELETE FROM supplier_taxonomy_supplier_links WHERE supplier_id = ?",
  ).run(supplierId);

  const insertItem = directoryDb.prepare(`
    INSERT OR IGNORE INTO supplier_taxonomy_item_suppliers (supplier_id, item_id, created_at)
    VALUES (?, ?, ?)
  `);
  for (const itemId of assignments.itemIds) insertItem.run(supplierId, itemId, createdAt);

  const insertNode = directoryDb.prepare(`
    INSERT OR IGNORE INTO supplier_taxonomy_supplier_links (supplier_id, node_id, created_at)
    VALUES (?, ?, ?)
  `);
  for (const nodeId of assignments.directNodeIds) insertNode.run(supplierId, nodeId, createdAt);
}

/**
 * Call within the caller's transaction after changing supplier/request linkage.
 * The submitted category JSON remains the source of truth for the public form;
 * normalized assignments are resolved against the active supplier taxonomy.
 */
export function syncSupplierCategoryAssignments(supplierId: number): void {
  const linkedRequest = directoryDb.prepare(`
    SELECT sr.categories, sr.created_at AS createdAt
    FROM suppliers s
    JOIN supplier_requests sr ON sr.id = s.request_id
    WHERE s.id = ? AND sr.status = 'approved'
  `).get(supplierId) as { categories: string; createdAt: string } | undefined;

  if (!linkedRequest) {
    directoryDb.prepare(
      "DELETE FROM supplier_taxonomy_item_suppliers WHERE supplier_id = ?",
    ).run(supplierId);
    directoryDb.prepare(
      "DELETE FROM supplier_taxonomy_supplier_links WHERE supplier_id = ?",
    ).run(supplierId);
    return;
  }

  const assignments = assignmentsFor(linkedRequest.categories);
  replaceSupplierTaxonomyAssignments(
    supplierId,
    assignments,
    linkedRequest.createdAt || new Date().toISOString(),
  );
}

/**
 * Re-resolve approved registration JSON after a deliberate taxonomy change.
 * Call within the caller's transaction.
 */
export function syncAllSupplierCategoryAssignments(): void {
  const linkedRequests = directoryDb.prepare(`
    SELECT s.id AS supplierId, sr.categories, sr.created_at AS createdAt
    FROM suppliers s
    JOIN supplier_requests sr ON sr.id = s.request_id
    WHERE sr.status = 'approved'
    ORDER BY s.id
  `).all() as Array<{ supplierId: number; categories: string; createdAt: string }>;

  const resolved = linkedRequests.map((request) => ({
    ...request,
    assignments: assignmentsFor(request.categories),
  }));

  directoryDb.exec("DELETE FROM supplier_taxonomy_item_suppliers");
  directoryDb.exec("DELETE FROM supplier_taxonomy_supplier_links");
  for (const request of resolved) {
    replaceSupplierTaxonomyAssignments(
      request.supplierId,
      request.assignments,
      request.createdAt || new Date().toISOString(),
    );
  }
}