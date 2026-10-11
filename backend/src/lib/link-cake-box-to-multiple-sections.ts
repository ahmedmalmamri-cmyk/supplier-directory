import type { DatabaseSync } from "node:sqlite";

const migrationName = "classify-carton-cake-box-in-packaging-and-cake";
const itemName = "علب كرتونية للكيك";

/** Keep one item row, make packaging primary, and retain its packaging leaf. */
export function linkCakeBoxToMultipleSections(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM directory_migrations WHERE name = ?").get(migrationName)) return;
  const itemRows = db.prepare(
    "SELECT id, category_id AS categoryId FROM supplier_taxonomy_items WHERE name = ?",
  ).all(itemName) as Array<{ id: number; categoryId: number }>;
  const roots = db.prepare(`
    SELECT id, name FROM supplier_taxonomy_nodes
    WHERE parent_id IS NULL AND name IN ('مستلزمات التغليف والتقديم', 'مستلزمات الكيك')
      AND is_active = 1
  `).all() as Array<{ id: number; name: string }>;
  if (itemRows.length !== 1 || roots.length !== 2) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    if (db.prepare("SELECT 1 FROM directory_migrations WHERE name = ?").get(migrationName)) {
      db.exec("COMMIT");
      return;
    }
    const item = db.prepare(
      "SELECT id, category_id AS categoryId FROM supplier_taxonomy_items WHERE name = ?",
    ).get(itemName) as { id: number; categoryId: number } | undefined;
    if (!item) {
      db.exec("ROLLBACK");
      return;
    }
    const packagingId = roots.find(root => root.name === "مستلزمات التغليف والتقديم")!.id;
    const cakeId = roots.find(root => root.name === "مستلزمات الكيك")!.id;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT OR IGNORE INTO items_categories (item_id, category_id, is_primary, created_at)
      VALUES (?, ?, 0, ?)
    `).run(item.id, packagingId, now);
    db.prepare(`
      INSERT OR IGNORE INTO items_categories (item_id, category_id, is_primary, created_at)
      VALUES (?, ?, 0, ?)
    `).run(item.id, cakeId, now);
    db.prepare("UPDATE items_categories SET is_primary = 0 WHERE item_id = ?").run(item.id);
    db.prepare("UPDATE items_categories SET is_primary = 1 WHERE item_id = ? AND category_id = ?")
      .run(item.id, packagingId);
    db.prepare(`
      UPDATE supplier_taxonomy_items SET category_id = ?, updated_at = ? WHERE id = ?
    `).run(packagingId, now, item.id);

    db.prepare(`
      INSERT INTO supplier_taxonomy_audit_log
        (admin_id, action, entity_id, entity_type, details, created_at)
      VALUES (NULL, 'system-item-category-link', ?, 'item', ?, ?)
    `).run(item.id, JSON.stringify({
      migrationName, itemName,
      primaryCategoryId: packagingId,
      additionalCategoryIds: [item.categoryId, cakeId].filter(id => id !== packagingId),
    }), now);
    db.prepare("INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)")
      .run(migrationName, now);
    if (db.prepare("PRAGMA foreign_key_check").all().length) {
      throw new Error("Packaging/cake item-category update left invalid foreign keys");
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}