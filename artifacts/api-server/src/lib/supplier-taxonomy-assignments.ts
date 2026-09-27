import { directoryDb } from "./directory-db";

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
  "المواد الأساسية": "دقيق وسكر",
  "منتجات الألبان": "بيض وألبان",
  "الأجبان": "بيض وألبان",
  "الشوكولاتة والكاكاو": "مستلزمات الكيك",
  "المكسرات والبذور": "مكسرات وإضافات",
  "خلطات جاهزة": "خلطات الكيك",
  "الخمائر والمحسنات": "مواد رافعة ونكهات",
  "النكهات والألوان": "مواد رافعة ونكهات",
  "العجائن والجاهز": "المواد الأولية",
  "التغليف والعلب": "مستلزمات التغليف",
  "المعدات والأدوات": "معدات المخابز",
  "حشوات الكيك": "حشوات الكيك",
  "مواد أخرى": "مستلزمات الكيك",
  دقيق: "دقيق وسكر",
  "سميد وبرغل": "دقيق وسكر",
  سكر: "دقيق وسكر",
  "سكر ومحليات": "دقيق وسكر",
  "دقيق وخبز": "دقيق وسكر",
  "زبدة ودهون": "زيوت ودهون",
  "دهون وزبدة": "زيوت ودهون",
  زبدة: "زيوت ودهون",
  سمن: "زيوت ودهون",
  مارجرين: "زيوت ودهون",
  "حليب ومشتقاته": "بيض وألبان",
  أجبان: "بيض وألبان",
  "زبادي وقشطة": "بيض وألبان",
  "حلوى وسكاكر": "مكسرات وإضافات",
  "جيلاتين وكاسترد": "مكسرات وإضافات",
  "شوكولاتة وكاكاو": "مستلزمات الكيك",
  مكسرات: "مكسرات وإضافات",
  "عسل ومحليات": "مكسرات وإضافات",
  دبس: "مكسرات وإضافات",
  "خمائر ومحسنات": "مواد رافعة ونكهات",
  "نكهات وألوان": "مواد رافعة ونكهات",
  "فانيليا ومستخلصات": "مواد رافعة ونكهات",
  "عجين سمبوسة": "المواد الأولية",
  "عجين بيتزا": "المواد الأولية",
  "خبز رقاق": "المواد الأولية",
  "خبز جاهز": "المواد الأولية",
  "معجنات مجمدة": "مكسرات وإضافات",
  "علب وتغليف": "مستلزمات التغليف",
  "أكياس مطبوعة": "أكياس التغليف",
  "كراتين مطبوعة": "علب الكيك",
  "أدوات تزيين": "كريمة وتزيين",
  "معدات وأفران": "معدات المخابز",
  "أدوات صغيرة": "معدات التشكيل",
  "خليط الكيك": "خلطات الكيك",
  "خليط الكيك - فانيليا": "خلطات الكيك",
  "خليط الكيك - شوكولاتة": "خلطات الكيك",
  "خليط ريد فيلفيت": "خلطات الكيك",
  "خليط الكيك - ليمون": "خلطات الكيك",
  "خليط الكيك - برتقال": "خلطات الكيك",
  "خليط الكب كيك": "خلطات الكيك",
  "خليط الكب كيك - شوكولاتة": "خلطات الكيك",
  "خليط الكب كيك - فانيليا": "خلطات الكيك",
  "خليط البراوني": "خلطات الكيك",
  "خليط المافن": "خلطات الكيك",
  "خليط المافن - شوكولاتة": "خلطات الكيك",
  "خليط المافن - فانيليا": "خلطات الكيك",
  "خليط البان كيك": "خلطات الكيك",
  "خليط الوافل": "خلطات الكيك",
  "خليط البسكويت": "خلطات الكيك",
  "خليط الكرواسون": "خلطات الكيك",
  "اسبونش كيك فانيليا": "خلطات الكيك",
  "خلطات براوني": "خلطات الكيك",
  "خلطات دونات": "خلطات الكيك",
  "خلطات قسم الكيك الجاهزة": "خلطات الكيك",
  "خلطات كيك": "خلطات الكيك",
  "خلطات مافن": "خلطات الكيك",
  شوكولاتة: "مستلزمات الكيك",
  كاكاو: "مستلزمات الكيك",
  "عبوات وتغليف": "مستلزمات التغليف",
  "معدات وأدوات": "معدات المخابز",
  أخرى: "المواد الأولية",
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

export function getActiveSupplierTaxonomyChoiceRows(): PublicTaxonomyChoice[] {
  const now = new Date().toISOString();
  const nodes = getActiveSupplierTaxonomyNodes();
  const items = getActiveSupplierTaxonomyItems();
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