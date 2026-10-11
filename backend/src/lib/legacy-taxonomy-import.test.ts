import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { importLegacyTaxonomyItems, previewLegacyTaxonomyImport, TEMPORARY_CATEGORY_NAME } from "./legacy-taxonomy-import";

test("legacy import skips duplicate items, keeps old records, and does not resurrect deleted imports", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE item_categories (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL,
      parent_id INTEGER REFERENCES item_categories(id)
    );
    CREATE TABLE supplier_categories (supplier_id INTEGER NOT NULL, item_category_id INTEGER NOT NULL);
    CREATE TABLE supplier_taxonomy_nodes (
      id INTEGER PRIMARY KEY, parent_id INTEGER, name TEXT NOT NULL,
      icon TEXT NOT NULL, description TEXT, display_order INTEGER NOT NULL,
      is_active INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE supplier_taxonomy_items (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE,
      category_id INTEGER NOT NULL REFERENCES supplier_taxonomy_nodes(id) ON DELETE RESTRICT,
      is_active INTEGER NOT NULL, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE items_categories (
      id INTEGER PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES supplier_taxonomy_items(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES supplier_taxonomy_nodes(id) ON DELETE CASCADE,
      is_primary INTEGER NOT NULL, created_at TEXT NOT NULL,
      UNIQUE (item_id, category_id)
    );
    CREATE TABLE supplier_taxonomy_item_suppliers (
      supplier_id INTEGER NOT NULL, item_id INTEGER NOT NULL REFERENCES supplier_taxonomy_items(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL, PRIMARY KEY (supplier_id, item_id)
    );
    CREATE TABLE supplier_taxonomy_legacy_item_mappings (
      legacy_item_category_id INTEGER PRIMARY KEY,
      taxonomy_item_id INTEGER NOT NULL REFERENCES supplier_taxonomy_items(id) ON DELETE CASCADE,
      reviewed_at TEXT NOT NULL
    );
    CREATE TABLE supplier_taxonomy_legacy_imports (
      legacy_item_category_id INTEGER PRIMARY KEY,
      taxonomy_item_id INTEGER REFERENCES supplier_taxonomy_items(id) ON DELETE SET NULL,
      outcome TEXT NOT NULL, created_at TEXT NOT NULL
    );
    INSERT INTO item_categories VALUES
      (10, 'مجموعة قديمة', NULL),
      (11, 'صنف فريد', 10),
      (12, ' صنف مكرر ', 10),
      (13, 'صنف مستقل', NULL);
    INSERT INTO supplier_categories VALUES (9, 11), (10, 12);
    INSERT INTO supplier_taxonomy_nodes VALUES (1, NULL, 'قسم موجود', '📦', NULL, 1, 1, 'old', 'old');
    INSERT INTO supplier_taxonomy_items VALUES (21, 'صنف مكرر', 1, 1, NULL, 'old', 'old');
    INSERT INTO items_categories (item_id, category_id, is_primary, created_at) VALUES (21, 1, 1, 'old');
  `);

  const preview = previewLegacyTaxonomyImport(db);
  assert.equal(preview.sourceItemCount, 3);
  assert.equal(preview.duplicateCount, 1);
  assert.equal(preview.readyToImportCount, 2);
  assert.equal(preview.unreviewedSupplierLinkCount, 2);
  assert.equal(preview.temporaryCategoryId, null);

  const first = importLegacyTaxonomyItems(db, "2026-09-27");
  assert.deepEqual([first.added, first.skippedDuplicates, first.alreadyMapped], [2, 1, 0]);
  assert.equal(first.summary.unreviewedItemCount, 1);
  assert.equal(first.summary.unreviewedSupplierLinkCount, 1);
  assert.equal(first.summary.readyToImportCount, 0);
  const temporary = db.prepare("SELECT id, is_active AS active FROM supplier_taxonomy_nodes WHERE name = ?")
    .get(TEMPORARY_CATEGORY_NAME) as { id: number; active: number };
  assert.equal(temporary.active, 0);
  const imported = db.prepare("SELECT id, is_active AS active FROM supplier_taxonomy_items WHERE name = 'صنف فريد'")
    .get() as { id: number; active: number };
  assert.equal(imported.active, 0);
  assert.equal((db.prepare("SELECT category_id AS categoryId FROM supplier_taxonomy_items WHERE id = ?")
    .get(imported.id) as { categoryId: number }).categoryId, temporary.id);
  assert.equal((db.prepare("SELECT is_primary AS primaryLink FROM items_categories WHERE item_id = ?")
    .get(imported.id) as { primaryLink: number }).primaryLink, 1);
  assert.deepEqual(db.prepare("SELECT supplier_id AS supplierId FROM supplier_taxonomy_item_suppliers WHERE item_id = ?")
    .all(imported.id).map(row => row.supplierId), [9]);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM supplier_taxonomy_item_suppliers WHERE supplier_id = 10")
    .get() as { count: number }).count, 0);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM item_categories").get() as { count: number }).count, 4);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM supplier_categories").get() as { count: number }).count, 2);
  assert.deepEqual(db.prepare("SELECT name FROM supplier_taxonomy_items ORDER BY name")
    .all().map(row => row.name).sort(), ["صنف فريد", "صنف مستقل", "صنف مكرر"].sort());

  const second = importLegacyTaxonomyItems(db, "2026-09-28");
  assert.deepEqual([second.added, second.skippedDuplicates, second.alreadyMapped], [0, 0, 0]);
  db.prepare("DELETE FROM supplier_taxonomy_items WHERE id = ?").run(imported.id);
  const third = importLegacyTaxonomyItems(db, "2026-09-29");
  assert.equal(third.added, 0);
  assert.equal(third.summary.missingImportedCount, 1);
  assert.equal(db.prepare("SELECT id FROM supplier_taxonomy_items WHERE name = 'صنف فريد'").get(), undefined);
  db.close();
});