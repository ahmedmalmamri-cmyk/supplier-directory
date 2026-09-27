import { directoryDb } from "./directory-db";

export const publicSupplierTaxonomyCtes = `
  WITH RECURSIVE active_nodes (
    id, parentId, name, icon, description, displayOrder, createdAt, updatedAt, rootId
  ) AS (
    SELECT id, parent_id, name, icon, description, display_order,
      created_at, updated_at, id
    FROM supplier_taxonomy_nodes
    WHERE parent_id IS NULL AND is_active = 1
    UNION ALL
    SELECT child.id, child.parent_id, child.name, child.icon, child.description,
      child.display_order, child.created_at, child.updated_at, parent.rootId
    FROM supplier_taxonomy_nodes child
    JOIN active_nodes parent ON parent.id = child.parent_id
    WHERE child.is_active = 1
  ),
  active_item_nodes (itemId, nodeId) AS (
    SELECT item.id, item.category_id
    FROM supplier_taxonomy_items item
    JOIN active_nodes node ON node.id = item.category_id
    WHERE item.is_active = 1
    UNION
    SELECT item.id, link.category_id
    FROM supplier_taxonomy_items item
    JOIN items_categories link ON link.item_id = item.id
    JOIN active_nodes primaryNode ON primaryNode.id = item.category_id
    JOIN active_nodes node ON node.id = link.category_id
    WHERE item.is_active = 1
  ),
  node_ancestors (descendantId, ancestorId) AS (
    SELECT id, id FROM active_nodes
    UNION ALL
    SELECT ancestors.descendantId, parent.id
    FROM node_ancestors ancestors
    JOIN active_nodes child ON child.id = ancestors.ancestorId
    JOIN active_nodes parent ON parent.id = child.parentId
  )
`;

export function listPublicSupplierTaxonomyGroups() {
  return directoryDb.prepare(`
    ${publicSupplierTaxonomyCtes}
    SELECT node.id, node.name, 'group-' || node.id AS slug, node.icon,
      node.parentId, node.displayOrder, 1 AS isActive,
      (
        SELECT COUNT(DISTINCT itemNode.itemId)
        FROM active_item_nodes itemNode
        JOIN node_ancestors ancestors ON ancestors.descendantId = itemNode.nodeId
        WHERE ancestors.ancestorId = node.id
      ) AS categoryCount,
      (
        SELECT COUNT(DISTINCT linked.supplierId)
        FROM (
          SELECT itemLink.supplier_id AS supplierId, ancestors.ancestorId AS nodeId
          FROM supplier_taxonomy_item_suppliers itemLink
          JOIN suppliers itemSupplier
            ON itemSupplier.id = itemLink.supplier_id AND itemSupplier.is_active = 1
          JOIN active_item_nodes itemNode ON itemNode.itemId = itemLink.item_id
          JOIN node_ancestors ancestors ON ancestors.descendantId = itemNode.nodeId
          UNION
          SELECT nodeLink.supplier_id AS supplierId, ancestors.ancestorId AS nodeId
          FROM supplier_taxonomy_supplier_links nodeLink
          JOIN suppliers nodeSupplier
            ON nodeSupplier.id = nodeLink.supplier_id AND nodeSupplier.is_active = 1
          JOIN node_ancestors ancestors ON ancestors.descendantId = nodeLink.node_id
        ) linked
        WHERE linked.nodeId = node.id
      ) AS supplierCount
    FROM active_nodes node
    ORDER BY node.displayOrder, node.id
  `).all().map((row) => {
    const group = row as {
      id: number;
      name: string;
      slug: string;
      icon: string;
      parentId: number | null;
      displayOrder: number;
      isActive: number;
      categoryCount: number;
      supplierCount: number;
    };
    return { ...group, isActive: Boolean(group.isActive) };
  });
}

export function listPublicSupplierTaxonomyItems() {
  const rows = directoryDb.prepare(`
    ${publicSupplierTaxonomyCtes}
    SELECT item.id, item.name, node.icon, 'item-' || item.id AS slug,
      root.name AS groupName, root.id AS parentId, root.id AS primaryGroupId,
      CASE WHEN node.parentId IS NULL THEN NULL ELSE node.id END AS subGroupId,
      node.description, 0 AS displayOnHome, item.id AS displayOrder,
      1 AS isActive, item.created_at AS createdAt, item.updated_at AS updatedAt,
      (
        SELECT COUNT(DISTINCT link.supplier_id)
        FROM supplier_taxonomy_item_suppliers link
        JOIN suppliers supplier
          ON supplier.id = link.supplier_id AND supplier.is_active = 1
        WHERE link.item_id = item.id
      ) AS supplierCount,
      (
        SELECT json_group_array(taggedRootId)
        FROM (
          SELECT DISTINCT additionalNode.rootId AS taggedRootId
          FROM items_categories additional
          JOIN active_nodes additionalNode ON additionalNode.id = additional.category_id
          WHERE additional.item_id = item.id
            AND additional.category_id != item.category_id
            AND additionalNode.rootId != root.id
          ORDER BY additionalNode.rootId
        )
      ) AS tagGroupIdsJson
    FROM supplier_taxonomy_items item
    JOIN active_nodes node ON node.id = item.category_id
    JOIN active_nodes root ON root.id = node.rootId AND root.parentId IS NULL
    WHERE item.is_active = 1
    ORDER BY node.displayOrder, node.id, item.id
  `).all() as Array<{
    id: number;
    name: string;
    icon: string;
    slug: string;
    groupName: string;
    parentId: number;
    primaryGroupId: number;
    subGroupId: number | null;
    description: string | null;
    displayOnHome: number;
    displayOrder: number;
    isActive: number;
    createdAt: string;
    updatedAt: string;
    supplierCount: number;
    tagGroupIdsJson: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    slug: row.slug,
    groupName: row.groupName,
    parentId: row.parentId,
    primaryGroupId: row.primaryGroupId,
    subGroupId: row.subGroupId,
    tagGroupIds: row.tagGroupIdsJson ? JSON.parse(row.tagGroupIdsJson) as number[] : [],
    description: row.description,
    displayOnHome: Boolean(row.displayOnHome),
    displayOrder: row.displayOrder,
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    supplierCount: row.supplierCount,
  }));
}

export function resolvePublicSupplierTaxonomySelection(name: string) {
  const normalizedName = name.trim();
  const activeNodes = directoryDb.prepare(`
    ${publicSupplierTaxonomyCtes}
    SELECT id FROM active_nodes WHERE lower(trim(name)) = lower(?)
  `).all(normalizedName) as Array<{ id: number }>;
  const activeItems = directoryDb.prepare(`
    ${publicSupplierTaxonomyCtes}
    SELECT DISTINCT item.id
    FROM supplier_taxonomy_items item
    JOIN active_nodes node ON node.id = item.category_id
    WHERE item.is_active = 1 AND lower(trim(item.name)) = lower(?)
  `).all(normalizedName) as Array<{ id: number }>;
  const knownNode = directoryDb.prepare(`
    SELECT 1 FROM supplier_taxonomy_nodes WHERE lower(trim(name)) = lower(?) LIMIT 1
  `).get(normalizedName);
  const knownItem = directoryDb.prepare(`
    SELECT 1 FROM supplier_taxonomy_items WHERE lower(trim(name)) = lower(?) LIMIT 1
  `).get(normalizedName);

  const nodeIds = activeNodes.length
    ? (directoryDb.prepare(`
        ${publicSupplierTaxonomyCtes},
        descendants(id) AS (
          SELECT id FROM active_nodes WHERE lower(trim(name)) = lower(?)
          UNION ALL
          SELECT child.id FROM active_nodes child JOIN descendants parent ON child.parentId = parent.id
        )
        SELECT DISTINCT id FROM descendants
      `).all(normalizedName) as Array<{ id: number }>).map(({ id }) => id)
    : [];
  const itemIds = activeItems.map(({ id }) => id);
  const nodeItemIds = nodeIds.length
    ? (directoryDb.prepare(`
        ${publicSupplierTaxonomyCtes}
        SELECT DISTINCT itemNode.itemId AS id
        FROM active_item_nodes itemNode
        WHERE itemNode.nodeId IN (${nodeIds.map(() => "?").join(", ")})
      `).all(...nodeIds) as Array<{ id: number }>).map(({ id }) => id)
    : [];

  return {
    known: Boolean(knownNode || knownItem),
    nodeIds,
    itemIds: [...new Set([...itemIds, ...nodeItemIds])],
  };
}