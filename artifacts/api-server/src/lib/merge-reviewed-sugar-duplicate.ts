import type { DatabaseSync } from "node:sqlite";

const migrationName = "merge-reviewed-sugar-white-into-sugar";
const duplicateName = "سكر أبيض";
const canonicalName = "سكر";

type ItemIdentity = { id: number; name: string; categoryId: number };

/**
 * The owner explicitly reviewed these two names as the same item. Keep the
 * canonical "سكر" row and move every relational reference before deleting
 * "سكر أبيض". The duplicate's incorrect primary section is not retained.
 */
export function mergeReviewedSugarDuplicate(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM directory_migrations WHERE name = ?").get(migrationName)) return;
  const findItems = db.prepare(`
    SELECT id, name, category_id AS categoryId
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
    const transferred = {
      supplierLinks: count("supplier_taxonomy_item_suppliers", "item_id"),
      requestCategories: count("requests", "category_id"),
      availabilityInquiries: count("item_availability_inquiries", "item_id"),
      legacyMappings: count("supplier_taxonomy_legacy_item_mappings", "taxonomy_item_id"),
      legacyImports: count("supplier_taxonomy_legacy_imports", "taxonomy_item_id"),
      additionalCategories: (db.prepare(`
        SELECT COUNT(*) AS count FROM items_categories WHERE item_id = ? AND is_primary = 0
      `).get(source.id) as { count: number }).count,
    };

    db.prepare(`
      INSERT OR IGNORE INTO supplier_taxonomy_item_suppliers (supplier_id, item_id, created_at)
      SELECT supplier_id, ?, created_at FROM supplier_taxonomy_item_suppliers WHERE item_id = ?
    `).run(target.id, source.id);
    db.prepare(`
      INSERT OR IGNORE INTO items_categories (item_id, category_id, is_primary, created_at)
      SELECT ?, category_id, 0, created_at
      FROM items_categories
      WHERE item_id = ? AND is_primary = 0 AND category_id != ?
    `).run(target.id, source.id, target.categoryId);
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
    db.prepare("DELETE FROM supplier_taxonomy_items WHERE id = ?").run(source.id);

    if (db.prepare("PRAGMA foreign_key_check").all().length) {
      throw new Error("Sugar duplicate merge left invalid foreign keys");
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