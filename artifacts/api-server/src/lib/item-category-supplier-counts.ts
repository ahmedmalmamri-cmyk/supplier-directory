import { directoryDb } from "./directory-db";
import { resolveItemCategoryIdsForDirectIds } from "./item-category-aliases";

type ItemCategoryReference = {
  id: number;
  name: string;
  parentId: number | null;
};

export function itemCategorySupplierCounts(categories: ItemCategoryReference[]) {
  const suppliers = directoryDb.prepare(`
    SELECT sc.supplier_id AS supplierId, sc.item_category_id AS itemCategoryId
    FROM supplier_categories sc
    JOIN suppliers s ON s.id = sc.supplier_id AND s.is_active = 1
    JOIN item_categories assigned ON assigned.id = sc.item_category_id AND assigned.is_active = 1
  `).all() as Array<{ supplierId: number; itemCategoryId: number }>;
  const directCategoryIdsBySupplier = new Map<number, Set<number>>();
  for (const assignment of suppliers) {
    const directIds = directCategoryIdsBySupplier.get(assignment.supplierId) ?? new Set<number>();
    directIds.add(assignment.itemCategoryId);
    directCategoryIdsBySupplier.set(assignment.supplierId, directIds);
  }
  const suppliersByCategory = new Map<number, Set<number>>();

  for (const [supplierId, directIds] of directCategoryIdsBySupplier) {
    const included = resolveItemCategoryIdsForDirectIds(directIds, categories);

    for (const categoryId of included) {
      const supplierIds = suppliersByCategory.get(categoryId) ?? new Set<number>();
      supplierIds.add(supplierId);
      suppliersByCategory.set(categoryId, supplierIds);
    }
  }

  return new Map([...suppliersByCategory].map(([id, supplierIds]) => [id, supplierIds.size]));
}