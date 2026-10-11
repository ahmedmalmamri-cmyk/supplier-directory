import { directoryDb } from "./directory-db";
import {
  getActiveSupplierTaxonomyItems,
  getActiveSupplierTaxonomyNodes,
  normalizeTaxonomyName,
  resolveActiveSupplierTaxonomySelections,
} from "./supplier-taxonomy-assignments";

type ItemCategoryReference = {
  id: number;
  name: string;
  parentId: number | null;
};

export function itemCategorySupplierCounts(
  categories: ItemCategoryReference[],
  _activeGroupsOnly = false,
) {
  const nodes = getActiveSupplierTaxonomyNodes();
  const items = getActiveSupplierTaxonomyItems();
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodeByName = new Set(nodes.map((node) => normalizeTaxonomyName(node.name)));
  const itemByName = new Map(items.map((item) => [normalizeTaxonomyName(item.name), item]));
  const supplierIdsByItem = new Map<number, Set<number>>();
  const supplierIdsByNode = new Map<number, Set<number>>();
  const itemAssignments = directoryDb.prepare(`
    SELECT links.supplier_id AS supplierId, links.item_id AS itemId
    FROM supplier_taxonomy_item_suppliers links
    JOIN suppliers s ON s.id = links.supplier_id AND s.is_active = 1
    JOIN supplier_taxonomy_items i ON i.id = links.item_id AND i.is_active = 1
    JOIN supplier_taxonomy_nodes n ON n.id = i.category_id
    WHERE n.is_active = 1
  `).all() as Array<{ supplierId: number; itemId: number }>;
  for (const assignment of itemAssignments) {
    const supplierIds = supplierIdsByItem.get(assignment.itemId) ?? new Set<number>();
    supplierIds.add(assignment.supplierId);
    supplierIdsByItem.set(assignment.itemId, supplierIds);
  }

  const nodeAssignments = directoryDb.prepare(`
    SELECT links.supplier_id AS supplierId, links.node_id AS nodeId
    FROM supplier_taxonomy_supplier_links links
    JOIN suppliers s ON s.id = links.supplier_id AND s.is_active = 1
    JOIN supplier_taxonomy_nodes n ON n.id = links.node_id AND n.is_active = 1
  `).all() as Array<{ supplierId: number; nodeId: number }>;
  const addToNodeAndAncestors = (supplierId: number, startId: number) => {
    let nodeId: number | null = startId;
    while (nodeId !== null) {
      const supplierIds = supplierIdsByNode.get(nodeId) ?? new Set<number>();
      supplierIds.add(supplierId);
      supplierIdsByNode.set(nodeId, supplierIds);
      nodeId = nodeById.get(nodeId)?.parentId ?? null;
    }
  };
  for (const assignment of nodeAssignments) {
    addToNodeAndAncestors(assignment.supplierId, assignment.nodeId);
  }
  const categoryIdByItem = new Map(items.map((item) => [item.id, item.categoryId]));
  for (const assignment of itemAssignments) {
    const categoryId = categoryIdByItem.get(assignment.itemId);
    if (categoryId !== undefined) addToNodeAndAncestors(assignment.supplierId, categoryId);
  }

  const depthByNode = new Map<number, number>();
  const nodeDepth = (id: number): number => {
    const cached = depthByNode.get(id);
    if (cached !== undefined) return cached;
    const node = nodeById.get(id);
    const depth = !node || node.parentId === null ? 0 : nodeDepth(node.parentId) + 1;
    depthByNode.set(id, depth);
    return depth;
  };

  const counts = new Map<number, number>();
  for (const category of categories) {
    const normalized = normalizeTaxonomyName(category.name);
    const item = itemByName.get(normalized);
    const isExplicitNode = nodeByName.has(normalized);

    if (item && !(category.parentId === null && isExplicitNode)) {
      counts.set(category.id, supplierIdsByItem.get(item.id)?.size ?? 0);
      continue;
    }

    const selection = resolveActiveSupplierTaxonomySelections([category.name]);
    const selectedNodeId = [...selection.nodeIds]
      .sort((left, right) => nodeDepth(right) - nodeDepth(left))[0];
    if (selectedNodeId !== undefined) {
      counts.set(category.id, supplierIdsByNode.get(selectedNodeId)?.size ?? 0);
      continue;
    }

    counts.set(category.id, 0);
  }
  return counts;
}