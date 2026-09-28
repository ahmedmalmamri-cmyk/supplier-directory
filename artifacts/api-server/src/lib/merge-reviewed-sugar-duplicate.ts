import type { DatabaseSync } from "node:sqlite";

export type ReviewedDuplicateItemMerge = {
  migrationName: string;
  duplicateName: string;
  canonicalName: string;
  preserveSourcePrimaryAsAdditional?: boolean;
};

const sugarWhiteMerge: ReviewedDuplicateItemMerge = {
  migrationName: "merge-reviewed-sugar-white-into-sugar",
  duplicateName: "سكر أبيض",
  canonicalName: "سكر",
};

const additionallyApprovedMerges: readonly ReviewedDuplicateItemMerge[] = [
  {
    migrationName: "merge-reviewed-vegetable-oil-into-oil",
    duplicateName: "زيت نباتي",
    canonicalName: "زيت",
  },
  {
    migrationName: "merge-reviewed-vegetable-ghee-into-ghee",
    duplicateName: "سمن نباتي",
    canonicalName: "سمن",
  },
  {
    migrationName: "merge-reviewed-vanilla-powder-into-vanilla",
    duplicateName: "فانيليا بودرة",
    canonicalName: "فانيليا",
  },
  {
    migrationName: "merge-reviewed-brown-parchment-into-parchment",
    duplicateName: "ورق زبدة بني",
    canonicalName: "ورق زبدة",
  },
];

type ItemIdentity = { id: number; name: string; categoryId: number; notes: string | null };

/**
 * Merge only an explicitly reviewed duplicate. Existing item IDs remain
 * stable for canonical rows; every dependent record is repointed atomically.
 */
export function mergeReviewedDuplicateItem(
  db: DatabaseSync,
  merge: ReviewedDuplicateItemMerge,
): void {
  const { migrationName, duplicateName, canonicalName } = merge;
  if (db.prepare("SELECT 1 FROM directory_migrations WHERE name = ?").get(migrationName)) return;
  const findItems = db.prepare(`
    SELECT id, name, category_id AS categoryId, notes
    FROM supplier_taxonomy_items WHERE name = ? ORDER BY id
  `);
  const sourceMatches = findItems.all(duplicateName) as ItemIdentity[];
  const targetMatches = findItems.all(canonicalName) as ItemIdentity[];
  // Do not guess if an administrator has removed or duplicated either name.
  if (sourceMatches.length !== 1 || targetMatches.length !== 1) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    if (db.prepare("SELECT 1 FROM directory_migrations WHERE name = ?").get(migrationName)) {
      db.exec("COMMIT");
      return;
    }
    const source = findItems.get(duplicateName) as ItemIdentity | undefined;
    const target = findItems.get(canonicalName) as ItemIdentity | undefined;
    if (!source || !target || source.id === target.id) {
      db.exec("ROLLBACK");
      return;
    }
    const now = new Date().toISOString();
    const count = (table: string, column: string) => (db.prepare(
      `SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`,
    ).get(source.id) as { count: number }).count;
    const preserveSourcePrimary = merge.preserveSourcePrimaryAsAdditional === false ? 0 : 1;
    const transferred = {
      supplierLinks: count("supplier_taxonomy_item_suppliers", "item_id"),
      requestCategories: count("requests", "category_id"),
      availabilityInquiries: count("item_availability_inquiries", "item_id"),
      legacyMappings: count("supplier_taxonomy_legacy_item_mappings", "taxonomy_item_id"),
      legacyImports: count("supplier_taxonomy_legacy_imports", "taxonomy_item_id"),
      additionalCategories: (db.prepare(`
        SELECT COUNT(*) AS count FROM items_categories
        WHERE item_id = ? AND (is_primary = 0 OR ? = 1)
      `).get(source.id, preserveSourcePrimary) as { count: number }).count,
    };

    db.prepare(`
      INSERT OR IGNORE INTO supplier_taxonomy_item_suppliers (supplier_id, item_id, created_at)
      SELECT supplier_id, ?, created_at FROM supplier_taxonomy_item_suppliers WHERE item_id = ?
    `).run(target.id, source.id);
    db.prepare(`
      INSERT OR IGNORE INTO items_categories (item_id, category_id, is_primary, created_at)
      SELECT ?, category_id, 0, created_at
      FROM items_categories
      WHERE item_id = ? AND category_id != ?
        AND (is_primary = 0 OR ? = 1)
    `).run(
      target.id,
      source.id,
      target.categoryId,
      preserveSourcePrimary,
    );
    db.prepare("UPDATE requests SET category_id = ? WHERE category_id = ?").run(target.id, source.id);
    db.prepare("UPDATE item_availability_inquiries SET item_id = ? WHERE item_id = ?")
      .run(target.id, source.id);
    db.prepare(`
      UPDATE supplier_taxonomy_legacy_item_mappings
      SET taxonomy_item_id = ?, reviewed_at = ?
      WHERE taxonomy_item_id = ?
    `).run(target.id, now, source.id);
    db.prepare(`
      UPDATE supplier_taxonomy_legacy_imports
      SET taxonomy_item_id = ?, outcome = 'already_mapped'
      WHERE taxonomy_item_id = ?
    `).run(target.id, source.id);
    if (!target.notes && source.notes) {
      db.prepare("UPDATE supplier_taxonomy_items SET notes = ?, updated_at = ? WHERE id = ?")
        .run(source.notes, now, target.id);
    }
    db.prepare("DELETE FROM supplier_taxonomy_items WHERE id = ?").run(source.id);

    if (db.prepare("PRAGMA foreign_key_check").all().length) {
      throw new Error(`Duplicate merge for "${source.name}" left invalid foreign keys`);
    }
    db.prepare(`
      INSERT INTO supplier_taxonomy_audit_log
        (admin_id, action, entity_id, entity_type, details, created_at)
      VALUES (NULL, 'system-duplicate-merge', ?, 'item', ?, ?)
    `).run(target.id, JSON.stringify({
      migrationName, canonical: { id: target.id, name: target.name },
      merged: { id: source.id, name: source.name }, transferred,
    }), now);
    db.prepare("INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)")
      .run(migrationName, now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * "سكر أبيض" was explicitly approved as the same product as "سكر", but its
 * source category "بيض" was known to be incorrect and is intentionally omitted.
 */
export function mergeReviewedSugarDuplicate(db: DatabaseSync): void {
  mergeReviewedDuplicateItem(db, {
    ...sugarWhiteMerge,
    preserveSourcePrimaryAsAdditional: false,
  });
}

/** Apply the four additional item equivalences confirmed by the owner. */
export function mergeReviewedAdditionalDuplicates(db: DatabaseSync): void {
  for (const merge of additionallyApprovedMerges) mergeReviewedDuplicateItem(db, merge);
}