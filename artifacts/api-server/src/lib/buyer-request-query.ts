export const requestTaxonomyItemJoin = `
  LEFT JOIN supplier_taxonomy_items taxonomy_item
    ON taxonomy_item.id = r.category_id
`;

export function buildRequestFilter(filters: { categoryId?: number; city?: string; q?: string }) {
  const clauses: string[] = [];
  const values: Array<string | number> = [];
  const city = filters.city?.trim() ?? "";
  const query = filters.q?.trim() ?? "";

  if (filters.categoryId !== undefined) {
    clauses.push("r.category_id = ?");
    values.push(filters.categoryId);
  }
  if (city) {
    clauses.push("r.city = ?");
    values.push(city);
  }
  if (query) {
    clauses.push(`(
      instr(lower(r.title), lower(?)) > 0
      OR instr(lower(r.description), lower(?)) > 0
      OR instr(lower(coalesce(taxonomy_item.name, r.title)), lower(?)) > 0
      OR instr(lower(coalesce(b.business_name, '')), lower(?)) > 0
      OR instr(lower(r.city), lower(?)) > 0
    )`);
    values.push(query, query, query, query, query);
  }

  return {
    sql: clauses.map((clause) => `AND ${clause}`).join("\n"),
    values,
  };
}