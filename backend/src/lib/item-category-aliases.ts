export const legacyItemCategoryAliasTargets: Record<string, string[]> = {
  "دقيق وخبز": ["دقيق", "خبز جاهز"],
  "سكر ومحليات": ["سكر", "عسل ومحليات"],
  "دهون وزبدة": ["زبدة ودهون"],
};

export function expandLegacyItemCategoryNames(names: Iterable<string>): Set<string> {
  const expanded = new Set<string>();
  for (const name of names) {
    expanded.add(name);
    legacyItemCategoryAliasTargets[name]?.forEach((target) => expanded.add(target));
  }
  return expanded;
}

export function legacyItemCategoryAliasesForNames(names: Iterable<string>): Set<string> {
  const selectedNames = new Set(names);
  const aliases = new Set<string>();
  for (const [alias, targets] of Object.entries(legacyItemCategoryAliasTargets)) {
    if (targets.some((target) => selectedNames.has(target))) aliases.add(alias);
  }
  return aliases;
}

export function resolveDirectItemCategoryIdsForSelections(
  names: Iterable<string>,
  categories: Array<{ id: number; name: string }>,
  stableAliases: Array<{ alias: string; itemCategoryId: number }> = [],
): Set<number> {
  const categoryIdByName = new Map(categories.map((category) => [category.name, category.id]));
  const selectedNames = new Set(names);
  const selected = new Set<number>();
  for (const name of expandLegacyItemCategoryNames(selectedNames)) {
    const categoryId = categoryIdByName.get(name);
    if (categoryId !== undefined) selected.add(categoryId);
  }
  for (const mapping of stableAliases) {
    if (selectedNames.has(mapping.alias) && !categoryIdByName.has(mapping.alias)) {
      selected.add(mapping.itemCategoryId);
    }
  }
  return selected;
}

export function resolveItemCategoryIdsForDirectIds(
  directIds: Iterable<number>,
  categories: Array<{ id: number; parentId: number | null }>,
): Set<number> {
  const parentById = new Map(categories.map((category) => [category.id, category.parentId]));
  const included = new Set<number>();
  for (const directId of directIds) {
    let categoryId: number | undefined = directId;
    while (categoryId !== undefined && !included.has(categoryId)) {
      included.add(categoryId);
      categoryId = parentById.get(categoryId) ?? undefined;
    }
  }
  return included;
}

export function itemCategorySubtreeIds(
  selectedId: number,
  categories: Array<{ id: number; parentId: number | null }>,
): Set<number> {
  const childrenByParent = new Map<number, number[]>();
  for (const category of categories) {
    if (category.parentId === null) continue;
    const children = childrenByParent.get(category.parentId) ?? [];
    children.push(category.id);
    childrenByParent.set(category.parentId, children);
  }
  const included = new Set<number>();
  const pending = [selectedId];
  while (pending.length) {
    const id = pending.pop()!;
    if (included.has(id)) continue;
    included.add(id);
    pending.push(...(childrenByParent.get(id) ?? []));
  }
  return included;
}

export function resolveItemCategoryIdsForSelections(
  names: Iterable<string>,
  categories: Array<{ id: number; name: string; parentId: number | null }>,
): Set<number> {
  const directIds = resolveDirectItemCategoryIdsForSelections(names, categories);
  return resolveItemCategoryIdsForDirectIds(directIds, categories);
}