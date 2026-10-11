import { directoryDb } from "./directory-db";
import {
  getActiveSupplierTaxonomyItems,
  getActiveSupplierTaxonomyNodes,
  normalizeTaxonomyName,
} from "./supplier-taxonomy-assignments";

type MarketCategory = {
  key: string;
  id: number;
  name: string;
  kind: "item" | "node";
};

type SupplierRating = { id: number; rating: number };

function activeMarketCategories(): MarketCategory[] {
  const nodes = getActiveSupplierTaxonomyNodes();
  const items = getActiveSupplierTaxonomyItems();
  const categories: MarketCategory[] = [
    ...nodes.map((node) => ({
      key: `node:${node.id}`,
      id: node.id,
      name: node.name,
      kind: "node" as const,
    })),
    ...items.map((item) => ({
      key: `item:${item.id}`,
      id: item.id,
      name: item.name,
      kind: "item" as const,
    })),
  ];
  return categories;
}

function availableCities(): string[] {
  const setting = directoryDb.prepare("SELECT value FROM directory_settings WHERE key = 'available_cities'")
    .get() as { value: string } | undefined;
  try {
    const parsed: unknown = JSON.parse(setting?.value ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((city): city is string => typeof city === "string") : [];
  } catch {
    return [];
  }
}

function nodeAncestors(nodeId: number, parentByNode: Map<number, number | null>): number[] {
  const ancestors: number[] = [];
  let current: number | null = nodeId;
  const visited = new Set<number>();
  while (current !== null && !visited.has(current)) {
    visited.add(current);
    ancestors.push(current);
    current = parentByNode.get(current) ?? null;
  }
  return ancestors;
}

export function getSupplierMarket(supplierId: number) {
  const categories = activeMarketCategories();
  const nodes = getActiveSupplierTaxonomyNodes();
  const items = getActiveSupplierTaxonomyItems();
  const parentByNode = new Map(nodes.map((node) => [node.id, node.parentId]));
  const itemNodeById = new Map(items.map((item) => [item.id, item.categoryId]));
  const keyByNode = new Map(nodes.map((node) => [node.id, `node:${node.id}`]));
  const keyByItem = new Map(items.map((item) => [item.id, `item:${item.id}`]));
  const categoryByKey = new Map(categories.map((category) => [category.key, category]));

  const directItemAssignments = directoryDb.prepare(`
    SELECT links.supplier_id AS supplierId, links.item_id AS itemId
    FROM supplier_taxonomy_item_suppliers links
    JOIN suppliers s ON s.id = links.supplier_id AND s.is_active = 1
    JOIN supplier_taxonomy_items i ON i.id = links.item_id AND i.is_active = 1
    JOIN supplier_taxonomy_nodes n ON n.id = i.category_id AND n.is_active = 1
  `).all() as Array<{ supplierId: number; itemId: number }>;
  const directNodeAssignments = directoryDb.prepare(`
    SELECT links.supplier_id AS supplierId, links.node_id AS nodeId
    FROM supplier_taxonomy_supplier_links links
    JOIN suppliers s ON s.id = links.supplier_id AND s.is_active = 1
    JOIN supplier_taxonomy_nodes n ON n.id = links.node_id AND n.is_active = 1
  `).all() as Array<{ supplierId: number; nodeId: number }>;

  const directKeysBySupplier = new Map<number, Set<string>>();
  const effectiveSuppliersByKey = new Map<string, Set<number>>();
  const addDirectKey = (supplierId: number, key: string) => {
    const ownKeys = directKeysBySupplier.get(supplierId) ?? new Set<string>();
    ownKeys.add(key);
    directKeysBySupplier.set(supplierId, ownKeys);
  };
  const addEffectiveKey = (supplierId: number, key: string) => {
    const supplierIds = effectiveSuppliersByKey.get(key) ?? new Set<number>();
    supplierIds.add(supplierId);
    effectiveSuppliersByKey.set(key, supplierIds);
  };

  for (const { supplierId, itemId } of directItemAssignments) {
    const itemKey = keyByItem.get(itemId);
    const categoryNodeId = itemNodeById.get(itemId);
    if (!itemKey || categoryNodeId === undefined) continue;
    addDirectKey(supplierId, itemKey);
    addEffectiveKey(supplierId, itemKey);
    for (const nodeId of nodeAncestors(categoryNodeId, parentByNode)) {
      const nodeKey = keyByNode.get(nodeId);
      if (nodeKey) addEffectiveKey(supplierId, nodeKey);
    }
  }
  for (const { supplierId, nodeId } of directNodeAssignments) {
    const nodeKey = keyByNode.get(nodeId);
    if (!nodeKey) continue;
    addDirectKey(supplierId, nodeKey);
    for (const ancestorId of nodeAncestors(nodeId, parentByNode)) {
      const ancestorKey = keyByNode.get(ancestorId);
      if (ancestorKey) addEffectiveKey(supplierId, ancestorKey);
    }
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const demandQuery = directoryDb.prepare(`
    SELECT COUNT(DISTINCT buyer_id) AS buyers FROM buyer_search_logs
    WHERE buyer_id IS NOT NULL AND searched_at >= ? AND lower(search_term) LIKE '%' || lower(?) || '%'
  `);
  const demand = categories.map((category) => ({
    ...category,
    buyers: Number((demandQuery.get(since, category.name) as { buyers: number }).buyers),
  }));
  const ownCategories = [...(directKeysBySupplier.get(supplierId) ?? new Set<string>())]
    .map((key) => categoryByKey.get(key))
    .filter((category): category is MarketCategory => Boolean(category))
    .filter((category, index, all) =>
      all.findIndex((candidate) => normalizeTaxonomyName(candidate.name) === normalizeTaxonomyName(category.name)) === index,
    );
  const ownCategoryKeys = new Set(ownCategories.map((category) => category.key));

  const rated = directoryDb.prepare(`
    SELECT s.id, s.average_rating AS rating
    FROM suppliers s WHERE s.is_active = 1
      AND EXISTS (SELECT 1 FROM reviews r WHERE r.supplier_id = s.id)
  `).all() as SupplierRating[];
  const averageRating = rated.length
    ? Number((rated.reduce((sum, supplier) => sum + supplier.rating, 0) / rated.length).toFixed(1))
    : null;
  const ownRating = rated.find((supplier) => supplier.id === supplierId)?.rating;
  const ratingPercentile = ownRating !== undefined && rated.length > 1
    ? Math.round((rated.filter((supplier) => supplier.id !== supplierId && supplier.rating < ownRating).length / (rated.length - 1)) * 100)
    : null;
  const position = ownCategories.map((category) => {
    const peers = [...(effectiveSuppliersByKey.get(category.key) ?? new Set<number>())];
    const higher = ownRating === undefined
      ? 0
      : peers.filter((peerId) => {
        if (peerId === supplierId) return false;
        const rating = rated.find((supplier) => supplier.id === peerId)?.rating;
        return rating !== undefined && (rating > ownRating || (rating === ownRating && peerId < supplierId));
      }).length;
    return {
      categoryName: category.name,
      rank: ownRating === undefined ? 0 : higher + 1,
      total: peers.length,
    };
  });
  const supplierCount = Number((directoryDb.prepare(
    "SELECT COUNT(*) AS count FROM suppliers WHERE is_active = 1",
  ).get() as { count: number }).count);
  const ownSuppliers = directKeysBySupplier.get(supplierId);
  const underservedCities = ownSuppliers?.size
    ? availableCities().filter((city) => {
      const citySuppliers = directoryDb.prepare(`
        SELECT id FROM suppliers WHERE is_active = 1 AND city = ?
      `).all(city) as Array<{ id: number }>;
      return !citySuppliers.some((supplier) =>
        [...ownCategoryKeys].some((key) =>
          effectiveSuppliersByKey.get(key)?.has(supplier.id) ?? false,
        ),
      );
    })
    : [];

  return {
    topDemand: demand.filter((item) => item.buyers > 0)
      .sort((left, right) => right.buyers - left.buyers)
      .filter((item, index, all) =>
        all.findIndex((candidate) => normalizeTaxonomyName(candidate.name) === normalizeTaxonomyName(item.name)) === index,
      )
      .slice(0, 5)
      .map(({ name, buyers }) => ({ name, buyers })),
    lowSupply: categories
      .map((category) => ({
        ...category,
        supplierCount: effectiveSuppliersByKey.get(category.key)?.size ?? 0,
      }))
      .filter((category) => category.supplierCount > 0)
      .sort((left, right) => left.supplierCount - right.supplierCount)
      .filter((category, index, all) =>
        all.findIndex((candidate) => normalizeTaxonomyName(candidate.name) === normalizeTaxonomyName(category.name)) === index,
      )
      .slice(0, 5)
      .map(({ name, supplierCount: count }) => ({ name, supplierCount: count })),
    underservedCities,
    averageRating,
    ratingPercentile,
    position,
    supplierCount,
    ownDemand: demand.filter((item) => ownCategoryKeys.has(item.key))
      .reduce((sum, item) => sum + item.buyers, 0),
  };
}