import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { mergeReviewedSugarDuplicate } from "./merge-reviewed-sugar-duplicate.ts";

function createDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE directory_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE supplier_taxonomy_nodes (id INTEGER PRIMARY KEY);
    INSERT INTO supplier_taxonomy_nodes VALUES (1), (2), (3);
    CREATE TABLE supplier_taxonomy_items (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, category_id INTEGER NOT NULL,
      FOREIGN KEY (category_id) REFERENCES supplier_taxonomy_nodes(id)
    );
    INSERT INTO supplier_taxonomy_items VALUES (1, 'سكر أبيض', 2), (2, 'سكر', 1);
    CREATE TABLE items_categories (
      item_id INTEGER NOT NULL REFERENCES supplier_taxonomy_items(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES supplier_taxonomy_nodes(id),
      is_primary INTEGER NOT NULL, created_at TEXT NOT NULL, UNIQUE (item_id, category_id)
    );
    CREATE UNIQUE INDEX one_primary ON items_categories(item_id) WHERE is_primary = 1;
    INSERT INTO items_categories VALUES
      (1, 2, 1, 'old'), (1, 3, 0, 'additional'), (2, 1, 1, 'canonical');
    CREATE TABLE supplier_taxonomy_item_suppliers (
      supplier_id INTEGER NOT NULL, item_id INTEGER NOT NULL REFERENCES supplier_taxonomy_items(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL, PRIMARY KEY (supplier_id, item_id)
    );
    INSERT INTO supplier_taxonomy_item_suppliers VALUES (10, 1, 'old'), (11, 1, 'old'), (10, 2, 'canonical');
    CREATE TABLE requests (
      id INTEGER PRIMARY KEY, category_id INTEGER NOT NULL REFERENCES supplier_taxonomy_items(id)
    );
    INSERT INTO requests VALUES (1, 1);
    CREATE TABLE item_availability_inquiries (
      id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES supplier_taxonomy_items(id) ON DELETE RESTRICT
    );
    INSERT INTO item_availability_inquiries VALUES (1, 1);
    CREATE TABLE supplier_taxonomy_legacy_item_mappings (
      legacy_item_category_id INTEGER PRIMARY KEY,
      taxonomy_item_id INTEGER NOT NULL REFERENCES supplier_taxonomy_items(id) ON DELETE CASCADE,
      reviewed_at TEXT NOT NULL
    );
    INSERT INTO supplier_taxonomy_legacy_item_mappings VALUES (196, 1, 'old');
    CREATE TABLE supplier_taxonomy_legacy_imports (
      legacy_item_category_id INTEGER PRIMARY KEY,
      taxonomy_item_id INTEGER REFERENCES supplier_taxonomy_items(id) ON DELETE SET NULL,
      outcome TEXT NOT NULL, created_at TEXT NOT NULL
    );
    INSERT INTO supplier_taxonomy_legacy_imports VALUES (196, 1, 'already_mapped', 'old');
    CREATE TABLE supplier_taxonomy_audit_log (
      id INTEGER PRIMARY KEY, admin_id INTEGER, action TEXT, entity_id INTEGER,
      entity_type TEXT, details TEXT, created_at TEXT
    );
  `);
  return db;
}

test("merges the reviewed sugar duplicate without losing item or legacy links", () => {
  const db = createDatabase();
  mergeReviewedSugarDuplicate(db);
  mergeReviewedSugarDuplicate(db);

  assert.deepEqual(db.prepare("SELECT id, name FROM supplier_taxonomy_items ORDER BY id").all()
    .map((row: Record<string, unknown>) => ({ ...row })), [{ id: 2, name: "سكر" }]);
  assert.deepEqual(db.prepare(
    "SELECT category_id, is_primary FROM items_categories WHERE item_id = 2 ORDER BY category_id",
  ).all().map((row: Record<string, unknown>) => ({ ...row })), [
    { category_id: 1, is_primary: 1 },
    { category_id: 3, is_primary: 0 },
  ]);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM supplier_taxonomy_item_suppliers WHERE item_id = 2")
    .get() as { count: number }).count, 2);
  assert.equal((db.prepare("SELECT category_id FROM requests WHERE id = 1")
    .get() as { category_id: number }).category_id, 2);
  assert.equal((db.prepare("SELECT item_id FROM item_availability_inquiries WHERE id = 1")
    .get() as { item_id: number }).item_id, 2);
  assert.equal((db.prepare("SELECT taxonomy_item_id FROM supplier_taxonomy_legacy_item_mappings WHERE legacy_item_category_id = 196")
    .get() as { taxonomy_item_id: number }).taxonomy_item_id, 2);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM directory_migrations")
    .get() as { count: number }).count, 1);
  db.close();
});