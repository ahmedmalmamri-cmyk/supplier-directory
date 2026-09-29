import { directoryDb } from "./directory-db";
import { deferredServicesRootName } from "./public-supplier-taxonomy";

export type SupplierTaxonomyNode = {
  id: number;
  parentId: number | null;
  name: string;
  icon: string;
  description: string | null;
  displayOrder: number;
};

export type SupplierTaxonomyItem = {
  id: number;
  name: string;
  categoryId: number;
  categoryName: string;
  categoryParentId: number | null;
  categoryIcon: string;
  categoryDescription: string | null;
  categoryDisplayOrder: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupplierTaxonomySelection = {
  itemIds: Set<number>;
  nodeIds: Set<number>;
  directNodeIds: Set<number>;
  unresolved: string[];
};

export type PublicTaxonomyChoice = {
  id: number;
  name: string;
  icon: string;
  slug: string;
  groupName: string;
  parentId: number | null;
  primaryGroupId: number | null;
  subGroupId: number | null;
  description: string | null;
  displayOnHome: boolean;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const legacyNodeAliases: Record<string, string> = {
  "المواد الأساسية": "دقيق وحبوب",
  "منتجات الألبان": "حليب ومشتقاته",
  "الأجبان": "حليب ومشتقاته",
  "الشوكولاتة والكاكاو": "نكهات وملونات",
  "المكسرات والبذور": "مكسرات وفواكه",
  "الخمائر والمحسنات": "خمائر ومحسنات",
  "النكهات والألوان": "نكهات وملونات",
  "التغليف والعلب": "مستلزمات التغليف والتقديم",
  "المعدات والأدوات": "أصناف أخرى",
  "مواد أخرى": "أصناف أخرى",
  دقيق: "دقيق وحبوب",
  "سميد وبرغل": "دقيق وحبوب",
  سكر: "سكر ومحليات",
  "دقيق وخبز": "دقيق وحبوب",
  "زبدة ودهون": "زيوت وسمن",
  "دهون وزبدة": "زيوت وسمن",
  زبدة: "زيوت وسمن",
  سمن: "زيوت وسمن",
  مارجرين: "زيوت وسمن",
  أجبان: "حليب ومشتقاته",
  "زبادي وقشطة": "حليب ومشتقاته",
  "شوكولاتة وكاكاو": "نكهات وملونات",
  مكسرات: "مكسرات وفواكه",
  "عسل ومحليات": "سكر ومحليات",
  دبس: "سكر ومحليات",
  "نكهات وألوان": "نكهات وملونات",
  "فانيليا ومستخلصات": "نكهات وملونات",
  "عجين سمبوسة": "أصناف أخرى",
  "عجين بيتزا": "أصناف أخرى",
  "خبز رقاق": "أصناف أخرى",
  "خبز جاهز": "أصناف أخرى",
  "معجنات مجمدة": "أصناف أخرى",
  "علب وتغليف": "مستلزمات التغليف والتقديم",
  "أكياس مطبوعة": "أكياس وورق تغليف",
  "كراتين مطبوعة": "علب كيك وحلويات",
  "أدوات تزيين": "أصناف أخرى",
  "معدات وأفران": "أصناف أخرى",
  "أدوات صغيرة": "أصناف أخرى",
  شوكولاتة: "نكهات وملونات",
  كاكاو: "نكهات وملونات",
  "عبوات وتغليف": "مستلزمات التغليف والتقديم",
  "معدات وأدوات": "أصناف أخرى",
  أخرى: "أصناف أخرى",
};

export function normalizeTaxonomyName(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ar");
}

export function getActiveSupplierTaxonomyNodes(): SupplierTaxonomyNode[] {
  return directoryDb.prepare(`
    WITH RECURSIVE active_nodes(id, parent_id, name, icon, description, display_order) AS (
      SELECT id, parent_id, name, icon, description, display_order
      FROM supplier_taxonomy_nodes
      WHERE parent_id IS NULL AND is_active = 1
      UNION ALL
      SELECT child.id, child.parent_id, child.name, child.icon, child.description, child.display_order
      FROM supplier_taxonomy_nodes child
      JOIN active_nodes parent ON parent.id = child.parent_id
      WHERE child.is_active = 1
    )
    SELECT id, parent_id AS parentId, name, icon, description, display_order AS displayOrder
    FROM active_nodes
    ORDER BY display_order, id
  `).all() as SupplierTaxonomyNode[];
}

export function getActiveSupplierTaxonomyItems(): SupplierTaxonomyItem[] {
  return directoryDb.prepare(`
    WITH RECURSIVE active_nodes(id) AS (
      SELECT id FROM supplier_taxonomy_nodes WHERE parent_id IS NULL AND is_active = 1
      UNION ALL
      SELECT child.id
      FROM supplier_taxonomy_nodes child
      JOIN active_nodes parent ON parent.id = child.parent_id
      WHERE child.is_active = 1
    )
    SELECT i.id, i.name, i.category_id AS categoryId, n.name AS categoryName,
      n.parent_id AS categoryParentId, n.icon AS categoryIcon,
      n.description AS categoryDescription, n.display_order AS categoryDisplayOrder,
      i.notes AS description, i.created_at AS createdAt, i.updated_at AS updatedAt
    FROM supplier_taxonomy_items i
    JOIN supplier_taxonomy_nodes n ON n.id = i.category_id
    WHERE i.is_active = 1 AND n.id IN (SELECT id FROM active_nodes)
    ORDER BY n.display_order, n.id, i.name COLLATE NOCASE, i.id
  `).all() as SupplierTaxonomyItem[];
}

export function resolveActiveSupplierTaxonomySelections(
  names: Iterable<string>,
): SupplierTaxonomySelection {
  const nodes = getActiveSupplierTaxonomyNodes();
  const items = getActiveSupplierTaxonomyItems();
  const nodeByName = new Map(nodes.map((node) => [normalizeTaxonomyName(node.name), node]));
  const itemByName = new Map(items.map((item) => [normalizeTaxonomyName(item.name), item]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const itemIds = new Set<number>();
  const nodeIds = new Set<number>();
  const directNodeIds = new Set<number>();
  const unresolved: string[] = [];

  for (const rawName of names) {
    const name = rawName.trim();
    if (!name) continue;
    if (/^أخرى\s*:/u.test(name)) continue;

    const normalizedName = normalizeTaxonomyName(name);
    const item = itemByName.get(normalizedName);
    if (item) {
      itemIds.add(item.id);
      let nodeId: number | null = item.categoryId;
      while (nodeId !== null) {
        nodeIds.add(nodeId);
        nodeId = nodeById.get(nodeId)?.parentId ?? null;
      }
      continue;
    }

    const node = nodeByName.get(normalizedName)
      ?? nodeByName.get(normalizeTaxonomyName(legacyNodeAliases[name] ?? ""));
    if (node) {
      directNodeIds.add(node.id);
      let nodeId: number | null = node.id;
      while (nodeId !== null) {
        nodeIds.add(nodeId);
        nodeId = nodeById.get(nodeId)?.parentId ?? null;
      }
      continue;
    }

    unresolved.push(name);
  }

  return { itemIds, nodeIds, directNodeIds, unresolved };
}

export function isActiveSupplierTaxonomySelection(name: string): boolean {
  return resolveActiveSupplierTaxonomySelections([name]).unresolved.length === 0;
}

function visibleRegistrationNodeIds(nodes: SupplierTaxonomyNode[]): Set<number> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const hiddenRoots = new Set(nodes
    .filter((node) => node.parentId === null && node.name === deferredServicesRootName)
    .map((node) => node.id));
  return new Set(nodes.filter((node) => {
    let current: SupplierTaxonomyNode | undefined = node;
    while (current) {
      if (hiddenRoots.has(current.id)) return false;
      current = current.parentId === null ? undefined : nodeById.get(current.parentId);
    }
    return true;
  }).map((node) => node.id));
}

export function isRegistrationSupplierTaxonomySelection(name: string): boolean {
  const selection = resolveActiveSupplierTaxonomySelections([name]);
  const visibleIds = visibleRegistrationNodeIds(getActiveSupplierTaxonomyNodes());
  return selection.unresolved.length === 0 && selection.nodeIds.size > 0 &&
    [...selection.nodeIds].every((id) => visibleIds.has(id));
}

export function getActiveSupplierTaxonomyChoiceRows(excludeDeferredServices = false): PublicTaxonomyChoice[] {
  const now = new Date().toISOString();
  const activeNodes = getActiveSupplierTaxonomyNodes();
  const visibleIds = excludeDeferredServices ? visibleRegistrationNodeIds(activeNodes) : new Set(activeNodes.map((node) => node.id));
  const nodes = activeNodes.filter((node) => visibleIds.has(node.id));
  const items = getActiveSupplierTaxonomyItems().filter((item) => visibleIds.has(item.categoryId));
  const nodeIdForChoice = new Map(nodes.map((node) => [node.id, 1_000_000 + node.id]));
  const nodeRows = nodes.map((node, index) => ({
    id: nodeIdForChoice.get(node.id)!,
    name: node.name,
    icon: node.icon,
    slug: `taxonomy-node-${node.id}`,
    groupName: node.parentId === null ? node.name : nodes.find((parent) => parent.id === node.parentId)?.name ?? node.name,
    parentId: node.parentId === null ? null : nodeIdForChoice.get(node.parentId)!,
    primaryGroupId: node.parentId === null ? nodeIdForChoice.get(node.id)! : nodeIdForChoice.get(node.parentId)!,
    subGroupId: node.parentId === null ? null : nodeIdForChoice.get(node.id)!,
    description: node.description,
    displayOnHome: node.parentId === null,
    displayOrder: index,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }));
  const itemRows = items.map((item, index) => ({
    id: item.id,
    name: item.name,
    icon: item.categoryIcon,
    slug: `taxonomy-item-${item.id}`,
    groupName: item.categoryName,
    parentId: item.categoryId,
    primaryGroupId: item.categoryParentId ?? item.categoryId,
    subGroupId: item.categoryParentId === null ? null : item.categoryId,
    description: item.description,
    displayOnHome: false,
    displayOrder: index,
    isActive: true,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));

  return [...nodeRows, ...itemRows];
}

export function legacyCategoryIdForTaxonomyItem(itemId: number): number | undefined {
  return (directoryDb.prepare(`
    SELECT legacy_item_category_id AS id
    FROM supplier_taxonomy_legacy_imports
    WHERE taxonomy_item_id = ?
    ORDER BY legacy_item_category_id
    LIMIT 1
  `).get(itemId) as { id: number } | undefined)?.id;
}