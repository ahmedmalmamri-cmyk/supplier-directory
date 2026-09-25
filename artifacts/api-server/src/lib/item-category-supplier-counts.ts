import { directoryDb } from "./directory-db";
import { resolveItemCategoryIdsForDirectIds } from "./item-category-aliases";

type ItemCategoryReference = {
  id: number;
  name: string;
  parentId: number | null;
  primaryGroupId?: number | null;
};

export function itemCategorySupplierCounts(
  categories: ItemCategoryReference[],
  activeGroupsOnly = false,
) {
  const primaryGroupIdByCategory = new Map(
    categories.map((category) => [category.id, category.primaryGroupId ?? null]),
  );
  const suppliers = directoryDb.prepare(`
    SELECT sc.supplier_id AS supplierId, sc.item_category_id AS itemCategoryId
    FROM supplier_categories sc
    JOIN suppliers s ON s.id = sc.supplier_id AND s.is_active = 1
    JOIN item_categories assigned ON assigned.id = sc.item_category_id AND assigned.is_active = 1
      ${activeGroupsOnly ? `AND (
        (assigned.parent_id IS NULL AND EXISTS (
          SELECT 1 FROM groups active_root
          WHERE active_root.id = assigned.id AND active_root.is_active = 1
        ))
        OR (assigned.primary_group_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM groups active_primary
          WHERE active_primary.id = assigned.primary_group_id AND active_primary.is_active = 1
        ))
      )` : ""}
  `).all() as Array<{ supplierId: number; itemCategoryId: number }>;
  const directCategoryIdsBySupplier = new Map<number, Set<number>>();
  for (const assignment of suppliers) {
    const directIds = directCategoryIdsBySupplier.get(assignment.supplierId) ?? new Set<number>();
    directIds.add(assignment.itemCategoryId);
    directCategoryIdsBySupplier.set(assignment.supplierId, directIds);
  }
  const tagGroupIdsByCategory = new Map<number, Set<number>>();
  const categoryTags = directoryDb.prepare(`
    SELECT category_id AS categoryId, group_id AS groupId
    FROM category_tags
    ${activeGroupsOnly ? "JOIN groups g ON g.id = category_tags.group_id AND g.is_active = 1" : ""}
  `).all() as Array<{ categoryId: number; groupId: number }>;
  for (const tag of categoryTags) {
    const groupIds = tagGroupIdsByCategory.get(tag.categoryId) ?? new Set<number>();
    groupIds.add(tag.groupId);
    tagGroupIdsByCategory.set(tag.categoryId, groupIds);
  }
  const suppliersByCategory = new Map<number, Set<number>>();

  for (const [supplierId, directIds] of directCategoryIdsBySupplier) {
    const included = new Set<number>();
    for (const directId of directIds) {
      for (const id of resolveItemCategoryIdsForDirectIds([directId], categories)) included.add(id);
      const primaryGroupId = primaryGroupIdByCategory.get(directId);
      if (primaryGroupId != null) included.add(primaryGroupId);
      for (const groupId of tagGroupIdsByCategory.get(directId) ?? []) included.add(groupId);
    }

    for (const categoryId of included) {
      const supplierIds = suppliersByCategory.get(categoryId) ?? new Set<number>();
      supplierIds.add(supplierId);
      suppliersByCategory.set(categoryId, supplierIds);
    }
  }

  return new Map([...suppliersByCategory].map(([id, supplierIds]) => [id, supplierIds.size]));
}