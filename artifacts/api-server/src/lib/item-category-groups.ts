import { directoryDb } from "./directory-db";
import { itemCategorySupplierCounts } from "./item-category-supplier-counts";

export type GroupRecord = {
  id: number;
  name: string;
  slug: string;
  icon: string;
  displayOrder: number;
  isActive: number;
};

export type DeleteEmptyGroupResult =
  | { status: "deleted" }
  | { status: "missing-mirror" }
  | { status: "has-primary-categories"; count: number }
  | {
      status: "has-linked-data";
      supplierCategoryCount: number;
      productCount: number;
      aliasCount: number;
    };

export function deleteEmptyGroup(id: number): DeleteEmptyGroupResult {
  directoryDb.exec("BEGIN IMMEDIATE");
  try {
    const mirror = directoryDb.prepare(`
      SELECT id, name, icon, slug, group_name AS groupName,
        display_order AS displayOrder, is_active AS isActive
      FROM item_categories WHERE id = ? AND parent_id IS NULL
    `).get(id) as {
      id: number;
      name: string;
      icon: string;
      slug: string;
      groupName: string;
      displayOrder: number;
      isActive: number;
    } | undefined;
    if (!mirror) {
      directoryDb.exec("ROLLBACK");
      return { status: "missing-mirror" };
    }

    const primaryCategories = (directoryDb.prepare(`
      SELECT COUNT(*) AS count FROM item_categories
      WHERE primary_group_id = ? OR parent_id = ?
    `).get(id, id) as { count: number }).count;
    if (primaryCategories) {
      directoryDb.exec("ROLLBACK");
      return { status: "has-primary-categories", count: primaryCategories };
    }

    const supplierCategoryCount = (directoryDb.prepare(`
      SELECT COUNT(*) AS count FROM supplier_categories WHERE item_category_id = ?
    `).get(id) as { count: number }).count;
    const productCount = (directoryDb.prepare(`
      SELECT COUNT(*) AS count FROM products WHERE category_id = ?
    `).get(id) as { count: number }).count;
    const aliasCount = (directoryDb.prepare(`
      SELECT COUNT(*) AS count FROM item_category_aliases WHERE item_category_id = ?
    `).get(id) as { count: number }).count;
    if (supplierCategoryCount || productCount || aliasCount) {
      directoryDb.exec("ROLLBACK");
      return {
        status: "has-linked-data",
        supplierCategoryCount,
        productCount,
        aliasCount,
      };
    }

    const admin = directoryDb.prepare(
      "SELECT id FROM admin_credentials WHERE id = 1",
    ).get();
    if (admin) {
      directoryDb.prepare(`
        INSERT INTO activity_log
          (admin_id, action_type, entity_type, entity_id, old_value, new_value, created_at)
        VALUES (1, 'delete', 'category', ?, ?, ?, ?)
      `).run(
        id,
        JSON.stringify({ group: getGroupRecord(id), mirror }),
        JSON.stringify({ deleted: true }),
        new Date().toISOString(),
      );
    }
    directoryDb.prepare(`
      DELETE FROM category_tags WHERE group_id = ? OR category_id = ?
    `).run(id, id);
    const deletedMirror = directoryDb.prepare(`
      DELETE FROM item_categories WHERE id = ? AND parent_id IS NULL
    `).run(id);
    if (Number(deletedMirror.changes) !== 1) {
      throw new Error("Could not delete the mirrored category group root.");
    }
    const deletedGroup = directoryDb.prepare("DELETE FROM groups WHERE id = ?").run(id);
    if (Number(deletedGroup.changes) !== 1) {
      throw new Error("Could not delete the category group.");
    }
    directoryDb.exec("COMMIT");
    return { status: "deleted" };
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
}

export function categoryTagGroupIdsMap(activeGroupsOnly = false) {
  const rows = directoryDb.prepare(`
    SELECT ct.category_id AS categoryId, ct.group_id AS groupId
    FROM category_tags ct
    ${activeGroupsOnly ? "JOIN groups g ON g.id = ct.group_id AND g.is_active = 1" : ""}
    ORDER BY ct.group_id
  `).all() as Array<{ categoryId: number; groupId: number }>;
  const idsByCategory = new Map<number, number[]>();
  for (const row of rows) {
    const ids = idsByCategory.get(row.categoryId) ?? [];
    ids.push(row.groupId);
    idsByCategory.set(row.categoryId, ids);
  }
  return idsByCategory;
}

export function getGroupRecord(id: number) {
  return directoryDb.prepare(`
    SELECT id, name, slug, icon, display_order AS displayOrder,
      is_active AS isActive
    FROM groups WHERE id = ?
  `).get(id) as GroupRecord | undefined;
}

export function groupIdForRootCategory(categoryId: number) {
  const group = getGroupRecord(categoryId);
  if (!group) return undefined;
  const root = directoryDb.prepare(`
    SELECT id FROM item_categories
    WHERE id = ? AND parent_id IS NULL
  `).get(categoryId) as { id: number } | undefined;
  return root ? group.id : undefined;
}

export function listGroupSummaries(includeInactive: boolean) {
  const groupRows = directoryDb.prepare(`
    SELECT id, name, slug, icon, display_order AS displayOrder,
      is_active AS isActive
    FROM groups
    ${includeInactive ? "" : "WHERE is_active = 1"}
    ORDER BY display_order, id
  `).all() as GroupRecord[];
  const categoryCounts = directoryDb.prepare(`
    SELECT g.id AS groupId, COUNT(DISTINCT c.id) AS categoryCount
    FROM groups g
    LEFT JOIN item_categories c
      ON c.is_active = 1
      AND c.id <> g.id
      ${includeInactive ? "" : `AND EXISTS (
        SELECT 1 FROM groups primary_group
        WHERE primary_group.id = c.primary_group_id AND primary_group.is_active = 1
      )`}
      AND (
        c.primary_group_id = g.id
        OR EXISTS (
          SELECT 1 FROM category_tags ct
          WHERE ct.category_id = c.id AND ct.group_id = g.id
        )
      )
    GROUP BY g.id
  `).all() as Array<{ groupId: number; categoryCount: number }>;
  const categoryCountByGroup = new Map(categoryCounts.map((row) => [row.groupId, row.categoryCount]));
  const categories = directoryDb.prepare(`
    SELECT id, name, parent_id AS parentId,
      primary_group_id AS primaryGroupId
    FROM item_categories
    WHERE is_active = 1
  `).all() as Array<{
    id: number;
    name: string;
    parentId: number | null;
    primaryGroupId: number | null;
  }>;
  const supplierCounts = itemCategorySupplierCounts(categories, !includeInactive);

  return groupRows.map((group) => ({
    ...group,
    isActive: Boolean(group.isActive),
    categoryCount: categoryCountByGroup.get(group.id) ?? 0,
    supplierCount: supplierCounts.get(group.id) ?? 0,
  }));
}

export function getAdminCategoryStats() {
  const groupCount = (directoryDb.prepare(`
    SELECT COUNT(*) AS count FROM groups WHERE is_active = 1
  `).get() as { count: number }).count;
  const categoryCount = (directoryDb.prepare(`
    SELECT COUNT(*) AS count
    FROM item_categories
    WHERE is_active = 1 AND primary_group_id IS NOT NULL
  `).get() as { count: number }).count;
  const tagCount = (directoryDb.prepare(`
    SELECT COUNT(*) AS count
    FROM category_tags ct
    JOIN item_categories c ON c.id = ct.category_id AND c.is_active = 1
    JOIN groups g ON g.id = ct.group_id AND g.is_active = 1
  `).get() as { count: number }).count;
  const mostTaggedCategory = directoryDb.prepare(`
    SELECT c.id, c.name,
      (CASE WHEN primary_group.is_active = 1 THEN 1 ELSE 0 END) +
        COUNT(DISTINCT tagged_group.id) AS groupCount
    FROM item_categories c
    LEFT JOIN groups primary_group
      ON primary_group.id = c.primary_group_id
    LEFT JOIN category_tags ct
      ON ct.category_id = c.id
    LEFT JOIN groups tagged_group
      ON tagged_group.id = ct.group_id AND tagged_group.is_active = 1
    WHERE c.is_active = 1 AND c.primary_group_id IS NOT NULL
    GROUP BY c.id, c.name, primary_group.is_active
    ORDER BY groupCount DESC, c.id
    LIMIT 1
  `).get() as { id: number; name: string; groupCount: number } | undefined;

  return {
    groupCount,
    categoryCount,
    tagCount,
    mostTaggedCategory: mostTaggedCategory ?? null,
  };
}