import type { DatabaseSync } from "node:sqlite";

const almondItemNames = ["لوز حب", "لوز شرائح", "لوز مطحون"] as const;
const almondNameParameters = almondItemNames.map(() => "?").join(", ");

export type AlmondVariant = {
  form: "whole" | "slices" | "powder";
  preparation: "raw" | "roasted";
  size: "32" | "34" | "36" | null;
};

export type AlmondVariantMode = "unspecified" | "all" | "selected";
export type PublicAlmondVariantFilter = {
  form?: AlmondVariant["form"];
  preparation?: AlmondVariant["preparation"];
  size?: Exclude<AlmondVariant["size"], null>;
};

export function getAlmondItemIds(database: DatabaseSync) {
  return (database.prepare(`
    SELECT item.id
    FROM supplier_taxonomy_items item
    JOIN supplier_taxonomy_nodes node ON node.id = item.category_id AND node.is_active = 1
    WHERE item.is_active = 1 AND lower(trim(item.name)) IN (${almondNameParameters})
  `).all(...almondItemNames.map((name) => name.toLowerCase())) as Array<{ id: number }>).map(({ id }) => id);
}

export function supplierHasAlmondItemLink(supplierId: number, database: DatabaseSync) {
  return Boolean(database.prepare(`
    SELECT 1
    FROM supplier_taxonomy_item_suppliers link
    JOIN supplier_taxonomy_items item ON item.id = link.item_id AND item.is_active = 1
    JOIN supplier_taxonomy_nodes node ON node.id = item.category_id AND node.is_active = 1
    WHERE link.supplier_id = ?
      AND lower(trim(item.name)) IN (${almondNameParameters})
    LIMIT 1
  `).get(supplierId, ...almondItemNames.map((name) => name.toLowerCase())));
}

export function getSupplierAlmondVariants(supplierId: number, database: DatabaseSync) {
  const preference = database.prepare(`
    SELECT mode FROM supplier_almond_variant_preferences WHERE supplier_id = ?
  `).get(supplierId) as { mode: AlmondVariantMode } | undefined;
  const mode = preference?.mode ?? "unspecified";
  const variants = mode === "selected"
    ? database.prepare(`
        SELECT form, preparation, size
        FROM supplier_almond_variant_choices
        WHERE supplier_id = ?
        ORDER BY form, preparation, size
      `).all(supplierId).map((variant) => ({ ...variant })) as AlmondVariant[]
    : [];
  return { eligible: supplierHasAlmondItemLink(supplierId, database), mode, variants };
}

export function replaceSupplierAlmondVariants(
  supplierId: number,
  mode: AlmondVariantMode,
  variants: AlmondVariant[],
  database: DatabaseSync,
) {
  database.exec("BEGIN IMMEDIATE");
  try {
    if (!supplierHasAlmondItemLink(supplierId, database)) {
      database.exec("ROLLBACK");
      return false;
    }
    const now = new Date().toISOString();
    database.prepare(`
      INSERT INTO supplier_almond_variant_preferences (supplier_id, mode, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(supplier_id) DO UPDATE SET mode = excluded.mode, updated_at = excluded.updated_at
    `).run(supplierId, mode, now);
    database.prepare("DELETE FROM supplier_almond_variant_choices WHERE supplier_id = ?").run(supplierId);
    if (mode === "selected") {
      const insert = database.prepare(`
        INSERT INTO supplier_almond_variant_choices (supplier_id, form, preparation, size)
        VALUES (?, ?, ?, ?)
      `);
      for (const variant of variants) {
        insert.run(supplierId, variant.form, variant.preparation, variant.size);
      }
    }
    database.exec("COMMIT");
    return true;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function buildPublicAlmondSupplierFilter(
  itemIds: number[],
  variantFilter?: PublicAlmondVariantFilter,
) {
  if (!itemIds.length) return { sql: "0", params: [] as (string | number)[] };
  const params: (string | number)[] = [...itemIds];
  const predicates = ["variantPreference.mode = 'all'"];
  const choicePredicates: string[] = [];
  if (variantFilter?.form !== undefined) {
    choicePredicates.push("variantChoice.form = ?");
    params.push(variantFilter.form);
  }
  if (variantFilter?.preparation !== undefined) {
    choicePredicates.push("variantChoice.preparation = ?");
    params.push(variantFilter.preparation);
  }
  if (variantFilter?.size !== undefined) {
    choicePredicates.push("variantChoice.size = ?");
    params.push(variantFilter.size);
  }
  let variantPredicate = "";
  if (choicePredicates.length) {
    predicates.push(`(
      variantPreference.mode = 'selected'
      AND EXISTS (
        SELECT 1 FROM supplier_almond_variant_choices variantChoice
        WHERE variantChoice.supplier_id = variantPreference.supplier_id
          AND ${choicePredicates.join(" AND ")}
      )
    )`);
    variantPredicate = `AND EXISTS (
      SELECT 1 FROM supplier_almond_variant_preferences variantPreference
      WHERE variantPreference.supplier_id = s.id
        AND (${predicates.join(" OR ")})
    )`;
  }
  return {
    sql: `EXISTS (
      SELECT 1 FROM supplier_taxonomy_item_suppliers almondLink
      WHERE almondLink.supplier_id = s.id
        AND almondLink.item_id IN (${itemIds.map(() => "?").join(", ")})
    ) ${variantPredicate}`,
    params,
  };
}