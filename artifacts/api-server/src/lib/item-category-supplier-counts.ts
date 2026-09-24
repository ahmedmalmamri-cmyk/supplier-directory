import { directoryDb } from "./directory-db";

type ItemCategoryReference = {
  id: number;
  name: string;
  parentId: number | null;
};

export function itemCategorySupplierCounts(categories: ItemCategoryReference[]) {
  const categoryIdByName = new Map(categories.map((category) => [category.name, category.id]));
  const parentById = new Map(categories.map((category) => [category.id, category.parentId]));
  const suppliers = directoryDb.prepare(`
    SELECT s.id, sr.categories
    FROM suppliers s
    JOIN supplier_requests sr ON sr.id = s.request_id
    WHERE s.is_active = 1
  `).all() as Array<{ id: number; categories: string }>;
  const suppliersByCategory = new Map<number, Set<number>>();

  for (const supplier of suppliers) {
    let selected: string[] = [];
    try {
      const parsed: unknown = JSON.parse(supplier.categories);
      if (Array.isArray(parsed)) {
        selected = parsed.filter((name): name is string => typeof name === "string");
      }
    } catch {
      selected = [];
    }

    const included = new Set<number>();
    for (const name of selected) {
      let categoryId = categoryIdByName.get(name);
      while (categoryId !== undefined && !included.has(categoryId)) {
        included.add(categoryId);
        categoryId = parentById.get(categoryId) ?? undefined;
      }
    }

    for (const categoryId of included) {
      const supplierIds = suppliersByCategory.get(categoryId) ?? new Set<number>();
      supplierIds.add(supplier.id);
      suppliersByCategory.set(categoryId, supplierIds);
    }
  }

  return new Map([...suppliersByCategory].map(([id, supplierIds]) => [id, supplierIds.size]));
}