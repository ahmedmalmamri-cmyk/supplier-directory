import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  csvCell,
  legacyMappingConflict,
  planUniqueTrimmedNames,
  transferTaxonomyRoot,
  wouldCreateTaxonomyCycle,
} from "./supplier-taxonomy-utils";

test("taxonomy move rejects self and descendants but permits unrelated parents or root", () => {
  const subtree = [8, 9, 10];
  assert.equal(wouldCreateTaxonomyCycle(8, 8, subtree), true);
  assert.equal(wouldCreateTaxonomyCycle(8, 10, subtree), true);
  assert.equal(wouldCreateTaxonomyCycle(8, 11, subtree), false);
  assert.equal(wouldCreateTaxonomyCycle(8, null, subtree), false);
});

test("taxonomy CSV escapes quotes and prevents spreadsheet formula execution", () => {
  assert.equal(csvCell('كرات "لولو"'), '"كرات ""لولو"""');
  assert.equal(csvCell("=IMPORTDATA(1)"), "\"'=IMPORTDATA(1)\"");
  assert.equal(csvCell(null), '""');
});

test("bulk item names are trim-normalized, case-sensitive, and skip existing or repeated exact names", () => {
  const result = planUniqueTrimmedNames(
    [" Flour ", "Flour", "flour", "Sugar", "Sugar"],
    new Set(["Sugar"]),
  );
  assert.deepEqual(result, { acceptedIndexes: [0, 2], skipped: 3 });
});

test("category transfer preserves subdivision IDs, descendant assignments, and supplier links", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE supplier_taxonomy_nodes (
      id INTEGER PRIMARY KEY,
      parent_id INTEGER REFERENCES supplier_taxonomy_nodes(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE supplier_taxonomy_items (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES supplier_taxonomy_nodes(id) ON DELETE RESTRICT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE items_categories (
      id INTEGER PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES supplier_taxonomy_items(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES supplier_taxonomy_nodes(id) ON DELETE CASCADE,
      is_primary INTEGER NOT NULL CHECK (is_primary IN (0, 1)),
      created_at TEXT NOT NULL,
      UNIQUE (item_id, category_id)
    );
    CREATE UNIQUE INDEX one_primary ON items_categories(item_id) WHERE is_primary = 1;
    CREATE TABLE supplier_taxonomy_supplier_links (
      supplier_id INTEGER NOT NULL,
      node_id INTEGER NOT NULL REFERENCES supplier_taxonomy_nodes(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (supplier_id, node_id)
    );
    CREATE TABLE supplier_taxonomy_item_suppliers (
      supplier_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL REFERENCES supplier_taxonomy_items(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (supplier_id, item_id)
    );
    CREATE TABLE supplier_taxonomy_legacy_item_mappings (
      legacy_item_category_id INTEGER PRIMARY KEY,
      taxonomy_item_id INTEGER NOT NULL REFERENCES supplier_taxonomy_items(id) ON DELETE CASCADE,
      reviewed_at TEXT NOT NULL
    );
    CREATE TABLE supplier_taxonomy_legacy_mappings (
      legacy_item_category_id INTEGER PRIMARY KEY,
      taxonomy_node_id INTEGER NOT NULL REFERENCES supplier_taxonomy_nodes(id) ON DELETE CASCADE,
      reviewed_at TEXT NOT NULL
    );
    INSERT INTO supplier_taxonomy_nodes VALUES
      (1, NULL, 'target', 0, 'old'),
      (2, NULL, 'deleted root', 0, 'old'),
      (3, 2, 'subdivision', 7, 'old'),
      (4, 3, 'nested subdivision', 1, 'old'),
      (5, 1, 'existing target child', 4, 'old');
    INSERT INTO supplier_taxonomy_items VALUES
      (10, 'root item', 2, 'old'),
      (11, 'child item', 3, 'old'),
      (12, 'nested item', 4, 'old');
    INSERT INTO items_categories (item_id, category_id, is_primary, created_at) VALUES
      (10, 2, 1, 'old'), (10, 5, 0, 'old'), (11, 3, 1, 'old'), (12, 4, 1, 'old');
    INSERT INTO supplier_taxonomy_supplier_links VALUES (101, 2, 'original');
    INSERT INTO supplier_taxonomy_supplier_links VALUES (102, 3, 'child link');
    INSERT INTO supplier_taxonomy_item_suppliers VALUES (201, 10, 'item link');
    INSERT INTO supplier_taxonomy_item_suppliers VALUES (202, 11, 'child item link');
    INSERT INTO supplier_taxonomy_legacy_item_mappings VALUES (301, 10, 'reviewed');
    INSERT INTO supplier_taxonomy_legacy_item_mappings VALUES (302, 11, 'reviewed');
    INSERT INTO supplier_taxonomy_legacy_mappings VALUES (401, 2, 'reviewed');
    INSERT INTO supplier_taxonomy_legacy_mappings VALUES (402, 3, 'reviewed');
  `);

  db.exec("BEGIN");
  const result = transferTaxonomyRoot(db, 2, 1, "new timestamp");
  db.exec("COMMIT");

  assert.deepEqual(result, { deletedNodeCount: 1, transferredItemCount: 1, transferredChildIds: [3] });
  assert.deepEqual(db.prepare("SELECT id, parent_id AS parentId, display_order AS displayOrder FROM supplier_taxonomy_nodes ORDER BY id").all().map((row: Record<string, unknown>) => ({ ...row })), [
    { id: 1, parentId: null, displayOrder: 0 },
    { id: 3, parentId: 1, displayOrder: 5 },
    { id: 4, parentId: 3, displayOrder: 1 },
    { id: 5, parentId: 1, displayOrder: 4 },
  ]);
  assert.deepEqual(db.prepare("SELECT id, category_id AS categoryId FROM supplier_taxonomy_items ORDER BY id").all().map((row: Record<string, unknown>) => ({ ...row })), [
    { id: 10, categoryId: 1 },
    { id: 11, categoryId: 3 },
    { id: 12, categoryId: 4 },
  ]);
  assert.deepEqual(db.prepare("SELECT item_id AS itemId, category_id AS categoryId, is_primary AS isPrimary FROM items_categories WHERE item_id = 10 ORDER BY category_id").all().map((row: Record<string, unknown>) => ({ ...row })), [
    { itemId: 10, categoryId: 1, isPrimary: 1 },
    { itemId: 10, categoryId: 5, isPrimary: 0 },
  ]);
  assert.deepEqual(db.prepare("SELECT supplier_id AS supplierId, item_id AS itemId FROM supplier_taxonomy_item_suppliers ORDER BY item_id").all().map((row: Record<string, unknown>) => ({ ...row })), [
    { supplierId: 201, itemId: 10 },
    { supplierId: 202, itemId: 11 },
  ]);
  assert.deepEqual(db.prepare("SELECT supplier_id AS supplierId, node_id AS nodeId FROM supplier_taxonomy_supplier_links ORDER BY supplier_id").all().map((row: Record<string, unknown>) => ({ ...row })), [
    { supplierId: 101, nodeId: 1 },
    { supplierId: 102, nodeId: 3 },
  ]);
  assert.deepEqual(db.prepare("SELECT legacy_item_category_id AS legacyId, taxonomy_item_id AS itemId FROM supplier_taxonomy_legacy_item_mappings ORDER BY legacy_item_category_id").all().map((row: Record<string, unknown>) => ({ ...row })), [
    { legacyId: 301, itemId: 10 },
    { legacyId: 302, itemId: 11 },
  ]);
  assert.deepEqual(db.prepare("SELECT legacy_item_category_id AS legacyId, taxonomy_node_id AS nodeId FROM supplier_taxonomy_legacy_mappings ORDER BY legacy_item_category_id").all().map((row: Record<string, unknown>) => ({ ...row })), [
    { legacyId: 401, nodeId: 1 },
    { legacyId: 402, nodeId: 3 },
  ]);
  db.close();
});

test("legacy mappings cannot silently redirect to a different item", () => {
  assert.equal(legacyMappingConflict(null, 7), false);
  assert.equal(legacyMappingConflict(7, 7), false);
  assert.equal(legacyMappingConflict(7, 8), true);
});