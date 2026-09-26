import { directoryDb } from "./directory-db";

type CategoryCount = { id: number; name: string; supplierCount: number };

function categories(): CategoryCount[] {
  return directoryDb.prepare(`
    SELECT c.id, c.name, COUNT(DISTINCT s.id) AS supplierCount
    FROM item_categories c
    LEFT JOIN supplier_categories sc ON sc.item_category_id = c.id
    LEFT JOIN suppliers s ON s.id = sc.supplier_id AND s.is_active = 1
    WHERE c.is_active = 1
    GROUP BY c.id
  `).all() as CategoryCount[];
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

export function getSupplierMarket(supplierId: number) {
  const allCategories = categories();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const demandQuery = directoryDb.prepare(`
    SELECT COUNT(DISTINCT buyer_id) AS buyers FROM buyer_search_logs
    WHERE buyer_id IS NOT NULL AND searched_at >= ? AND lower(search_term) LIKE '%' || lower(?) || '%'
  `);
  const demand = allCategories.map(({ id, name }) => ({
    id, name,
    buyers: Number((demandQuery.get(since, name) as { buyers: number }).buyers),
  }));
  const ownCategories = directoryDb.prepare(`
    SELECT c.id, c.name, COUNT(DISTINCT s.id) AS total
    FROM supplier_categories own
    JOIN item_categories c ON c.id = own.item_category_id AND c.is_active = 1
    JOIN supplier_categories sc ON sc.item_category_id = own.item_category_id
    JOIN suppliers s ON s.id = sc.supplier_id AND s.is_active = 1
    WHERE own.supplier_id = ?
    GROUP BY c.id
  `).all(supplierId) as Array<{ id: number; name: string; total: number }>;
  const cityQuery = directoryDb.prepare(`
    SELECT COUNT(DISTINCT s.id) AS suppliers
    FROM suppliers s JOIN supplier_categories sc ON sc.supplier_id = s.id
    WHERE s.is_active = 1 AND s.city = ?
      AND sc.item_category_id IN (SELECT item_category_id FROM supplier_categories WHERE supplier_id = ?)
  `);
  const underservedCities = ownCategories.length
    ? availableCities().filter((city) => Number((cityQuery.get(city, supplierId) as { suppliers: number }).suppliers) === 0)
    : [];
  const rated = directoryDb.prepare(`
    SELECT s.id, s.average_rating AS rating
    FROM suppliers s WHERE s.is_active = 1
      AND EXISTS (SELECT 1 FROM reviews r WHERE r.supplier_id = s.id)
  `).all() as Array<{ id: number; rating: number }>;
  const averageRating = rated.length
    ? Number((rated.reduce((sum, s) => sum + s.rating, 0) / rated.length).toFixed(1))
    : null;
  const ownRating = rated.find((s) => s.id === supplierId)?.rating;
  const ratingPercentile = ownRating !== undefined && rated.length > 1
    ? Math.round((rated.filter((s) => s.id !== supplierId && s.rating < ownRating).length / (rated.length - 1)) * 100)
    : null;
  const position = ownCategories.map(({ id, name, total }) => {
    if (ownRating === undefined) return { categoryName: name, rank: 0, total: Number(total) };
    const higher = directoryDb.prepare(`
      SELECT COUNT(*) AS count FROM suppliers s
      JOIN supplier_categories sc ON sc.supplier_id = s.id
      WHERE sc.item_category_id = ? AND s.is_active = 1
        AND (s.average_rating > ? OR (s.average_rating = ? AND s.id < ?))
    `).get(id, ownRating ?? 0, ownRating ?? 0, supplierId) as { count: number };
    return { categoryName: name, rank: Number(higher.count) + 1, total: Number(total) };
  });
  const supplierCount = Number((directoryDb.prepare("SELECT COUNT(*) AS count FROM suppliers WHERE is_active = 1").get() as { count: number }).count);
  return {
    topDemand: demand.filter((item) => item.buyers > 0).sort((a, b) => b.buyers - a.buyers).slice(0, 5).map(({ name, buyers }) => ({ name, buyers })),
    lowSupply: allCategories.filter((item) => item.supplierCount > 0).sort((a, b) => a.supplierCount - b.supplierCount).slice(0, 5).map(({ name, supplierCount }) => ({ name, supplierCount: Number(supplierCount) })),
    underservedCities,
    averageRating,
    ratingPercentile,
    position,
    supplierCount,
    ownDemand: demand.filter((item) => ownCategories.some((own) => own.id === item.id))
      .reduce((sum, item) => sum + item.buyers, 0),
  };
}