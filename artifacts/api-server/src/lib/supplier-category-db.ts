import { directoryDb } from "./directory-db";
import { resolveDirectItemCategoryIdsForSelections } from "./item-category-aliases";

type CategoryReference = { id: number; name: string };
type StableCategoryAlias = { alias: string; itemCategoryId: number };

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

function currentItemCategories(): CategoryReference[] {
  return directoryDb.prepare(`
    SELECT id, name FROM item_categories
  `).all() as CategoryReference[];
}

function currentItemCategoryAliases(): StableCategoryAlias[] {
  return directoryDb.prepare(`
    SELECT alias, item_category_id AS itemCategoryId FROM item_category_aliases
  `).all() as StableCategoryAlias[];
}

function insertSupplierCategoryAssignments(
  supplierId: number,
  rawCategories: string,
  categories: CategoryReference[],
  stableAliases: StableCategoryAlias[],
) {
  const categoryIds = resolveDirectItemCategoryIdsForSelections(
    parseSelectedCategories(rawCategories),
    categories,
    stableAliases,
  );
  const insert = directoryDb.prepare(`
    INSERT OR IGNORE INTO supplier_categories (supplier_id, item_category_id)
    VALUES (?, ?)
  `);
  for (const categoryId of categoryIds) insert.run(supplierId, categoryId);
}

/**
 * Call within the caller's transaction after changing supplier/request linkage.
 */
export function syncSupplierCategoryAssignments(supplierId: number): void {
  directoryDb.prepare(
    "DELETE FROM supplier_categories WHERE supplier_id = ?",
  ).run(supplierId);
  const linkedRequest = directoryDb.prepare(`
    SELECT sr.categories
    FROM suppliers s
    JOIN supplier_requests sr ON sr.id = s.request_id
    WHERE s.id = ? AND sr.status = 'approved'
  `).get(supplierId) as { categories: string } | undefined;
  if (!linkedRequest) return;
  insertSupplierCategoryAssignments(
    supplierId,
    linkedRequest.categories,
    currentItemCategories(),
    currentItemCategoryAliases(),
  );
}

/**
 * Re-resolve legacy JSON names after item-category names or assignments change.
 * Call within the caller's transaction.
 */
export function syncAllSupplierCategoryAssignments(): void {
  directoryDb.exec("DELETE FROM supplier_categories");
  const categories = currentItemCategories();
  const stableAliases = currentItemCategoryAliases();
  const linkedRequests = directoryDb.prepare(`
    SELECT s.id AS supplierId, sr.categories
    FROM suppliers s
    JOIN supplier_requests sr ON sr.id = s.request_id
    WHERE sr.status = 'approved'
  `).all() as Array<{ supplierId: number; categories: string }>;
  for (const linkedRequest of linkedRequests) {
    insertSupplierCategoryAssignments(
      linkedRequest.supplierId,
      linkedRequest.categories,
      categories,
      stableAliases,
    );
  }
}