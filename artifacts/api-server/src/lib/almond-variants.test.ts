import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  buildPublicAlmondSupplierFilter,
  getAlmondItemIds,
  getSupplierAlmondVariants,
  replaceSupplierAlmondVariants,
  supplierHasAlmondItemLink,
  type AlmondVariant,
} from "./almond-variants.ts";

function createFixtureDatabase() {
  const directory = mkdtempSync(path.join(tmpdir(), "almond-variants-"));
  const databasePath = path.join(directory, "fixture.sqlite");
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE suppliers (id INTEGER PRIMARY KEY);
    CREATE TABLE supplier_taxonomy_nodes (
      id INTEGER PRIMARY KEY,
      is_active INTEGER NOT NULL
    );
    CREATE TABLE supplier_taxonomy_items (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES supplier_taxonomy_nodes(id),
      is_active INTEGER NOT NULL
    );
    CREATE TABLE supplier_taxonomy_item_suppliers (
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      item_id INTEGER NOT NULL REFERENCES supplier_taxonomy_items(id),
      PRIMARY KEY (supplier_id, item_id)
    );
    CREATE TABLE supplier_almond_variant_preferences (
      supplier_id INTEGER PRIMARY KEY REFERENCES suppliers(id),
      mode TEXT NOT NULL CHECK (mode IN ('unspecified', 'all', 'selected')),
      updated_at TEXT NOT NULL
    );
    CREATE TABLE supplier_almond_variant_choices (
      supplier_id INTEGER NOT NULL REFERENCES supplier_almond_variant_preferences(supplier_id),
      form TEXT NOT NULL CHECK (form IN ('whole', 'slices', 'powder')),
      preparation TEXT NOT NULL CHECK (preparation IN ('raw', 'roasted')),
      size TEXT,
      CHECK (
        (form = 'whole' AND size IN ('32', '34', '36'))
        OR (form IN ('slices', 'powder') AND size IS NULL)
      )
    );
    INSERT INTO suppliers (id) VALUES (1), (2), (3), (4), (5);
    INSERT INTO supplier_taxonomy_nodes (id, is_active) VALUES (10, 1), (11, 1);
    INSERT INTO supplier_taxonomy_items (id, name, category_id, is_active) VALUES
      (20, 'لوز حب', 10, 1),
      (21, 'لوز شرائح', 10, 1),
      (22, 'لوز مطحون', 11, 1),
      (23, 'لوز حب مؤرشف', 10, 0);
    INSERT INTO supplier_taxonomy_item_suppliers (supplier_id, item_id) VALUES
      (1, 20), (2, 21), (3, 22), (4, 20), (5, 23);
  `);
  return { database, databasePath, directory };
}

function runPublicAlmondFilter(
  database: DatabaseSync,
  form?: "whole" | "slices" | "powder",
  preparation?: "raw" | "roasted",
  size?: "32" | "34" | "36",
) {
  const filter = buildPublicAlmondSupplierFilter(getAlmondItemIds(database), {
    ...(form === undefined ? {} : { form }),
    ...(preparation === undefined ? {} : { preparation }),
    ...(size === undefined ? {} : { size }),
  });
  return database.prepare(`
    SELECT s.id FROM suppliers s WHERE ${filter.sql} ORDER BY s.id
  `).all(...filter.params).map((row) => (row as { id: number }).id);
}

test("precise public matching uses one complete selected combination, excludes unspecified, and includes all", (t) => {
  const { database, directory } = createFixtureDatabase();
  t.after(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const splitCombinations: AlmondVariant[] = [
    { form: "whole", preparation: "raw", size: "32" },
    { form: "slices", preparation: "roasted", size: null },
  ];
  assert.equal(replaceSupplierAlmondVariants(1, "selected", splitCombinations, database), true);
  assert.equal(replaceSupplierAlmondVariants(3, "all", [], database), true);
  assert.equal(
    replaceSupplierAlmondVariants(4, "selected", [
      { form: "whole", preparation: "raw", size: "32" },
    ], database),
    true,
  );

  assert.deepEqual(runPublicAlmondFilter(database), [1, 2, 3, 4]);
  assert.deepEqual(runPublicAlmondFilter(database, "whole", "raw", "32"), [1, 3, 4]);
  // Supplier 1 has "whole/raw/32" and "slices/roasted/null", but not the
  // cross-combination "whole/roasted/32".
  assert.deepEqual(runPublicAlmondFilter(database, "whole", "roasted", "32"), [3]);
});

test("variant updates and clearing are persisted across database reopen", (t) => {
  const { database, databasePath, directory } = createFixtureDatabase();
  let currentDatabase = database;
  t.after(() => {
    currentDatabase.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const originalVariants: AlmondVariant[] = [
    { form: "whole", preparation: "raw", size: "34" },
    { form: "powder", preparation: "roasted", size: null },
  ];
  assert.equal(replaceSupplierAlmondVariants(1, "selected", originalVariants, database), true);
  assert.equal(replaceSupplierAlmondVariants(1, "selected", [
    { form: "slices", preparation: "raw", size: null },
  ], database), true);
  assert.deepEqual(
    database.prepare("SELECT form, preparation, size FROM supplier_almond_variant_choices WHERE supplier_id = 1")
      .all().map((row) => ({ ...row })),
    [{ form: "slices", preparation: "raw", size: null }],
  );

  database.close();
  currentDatabase = new DatabaseSync(databasePath);
  assert.deepEqual(getSupplierAlmondVariants(1, currentDatabase), {
    eligible: true,
    mode: "selected",
    variants: [{ form: "slices", preparation: "raw", size: null }],
  });
  assert.equal(replaceSupplierAlmondVariants(1, "unspecified", [], currentDatabase), true);
  currentDatabase.close();
  currentDatabase = new DatabaseSync(databasePath);
  assert.deepEqual(getSupplierAlmondVariants(1, currentDatabase), {
    eligible: true,
    mode: "unspecified",
    variants: [],
  });
  assert.equal(
    (currentDatabase.prepare("SELECT COUNT(*) AS count FROM supplier_almond_variant_choices WHERE supplier_id = 1")
      .get() as { count: number }).count,
    0,
  );
});

test("supplier without an active almond item link cannot save preferences", (t) => {
  const { database, directory } = createFixtureDatabase();
  t.after(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const unsupportedVariant: AlmondVariant = { form: "whole", preparation: "raw", size: "36" };

  assert.equal(supplierHasAlmondItemLink(5, database), false);
  assert.equal(replaceSupplierAlmondVariants(5, "selected", [unsupportedVariant], database), false);
  assert.deepEqual(getSupplierAlmondVariants(5, database), {
    eligible: false,
    mode: "unspecified",
    variants: [],
  });
  assert.equal(
    database.prepare("SELECT 1 FROM supplier_almond_variant_preferences WHERE supplier_id = 5").get(),
    undefined,
  );
});