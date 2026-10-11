import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { afterEach, test } from "node:test";
import {
  isLegacyItemCategoriesRetired,
  legacyItemCategoriesRetirementMarker,
  retireLegacyItemCategories,
} from "./retire-legacy-item-categories.ts";

const databases: DatabaseSync[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function createDatabase(requestCategoryTarget = "supplier_taxonomy_items"): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE item_categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      parent_id INTEGER REFERENCES item_categories(id)
    );
    CREATE TABLE groups (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE suppliers (id INTEGER PRIMARY KEY);
    CREATE TABLE supplier_taxonomy_nodes (
      id INTEGER PRIMARY KEY,
      is_active INTEGER NOT NULL
    );
    CREATE TABLE supplier_taxonomy_items (
      id INTEGER PRIMARY KEY,
      category_id INTEGER NOT NULL REFERENCES supplier_taxonomy_nodes(id),
      is_active INTEGER NOT NULL
    );
    CREATE TABLE supplier_taxonomy_legacy_item_mappings (
      legacy_item_category_id INTEGER PRIMARY KEY,
      taxonomy_item_id INTEGER NOT NULL REFERENCES supplier_taxonomy_items(id)
    );
    CREATE TABLE supplier_taxonomy_legacy_imports (
      legacy_item_category_id INTEGER PRIMARY KEY,
      taxonomy_item_id INTEGER REFERENCES supplier_taxonomy_items(id),
      outcome TEXT NOT NULL
    );
    CREATE TABLE supplier_taxonomy_item_suppliers (
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      item_id INTEGER NOT NULL REFERENCES supplier_taxonomy_items(id),
      PRIMARY KEY (supplier_id, item_id)
    );
    CREATE TABLE supplier_categories (
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      item_category_id INTEGER NOT NULL REFERENCES item_categories(id),
      PRIMARY KEY (supplier_id, item_category_id)
    );
    CREATE TABLE item_category_aliases (
      alias TEXT NOT NULL,
      item_category_id INTEGER NOT NULL REFERENCES item_categories(id),
      PRIMARY KEY (alias, item_category_id)
    );
    CREATE TABLE category_tags (
      category_id INTEGER NOT NULL REFERENCES item_categories(id),
      group_id INTEGER NOT NULL REFERENCES groups(id),
      PRIMARY KEY (category_id, group_id)
    );
    CREATE TABLE requests (
      id INTEGER PRIMARY KEY,
      category_id INTEGER NOT NULL REFERENCES ${requestCategoryTarget}(id)
    );
    CREATE TABLE supplier_request_contact_logs (
      id INTEGER PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES requests(id)
    );
  `);

  database.prepare("INSERT INTO supplier_taxonomy_nodes VALUES (1, 1)").run();
  database.prepare("INSERT INTO suppliers VALUES (1)").run();
  const addOldCategory = database.prepare(
    "INSERT INTO item_categories (id, name, parent_id) VALUES (?, ?, ?)",
  );
  const addTaxonomyItem = database.prepare(
    "INSERT INTO supplier_taxonomy_items (id, category_id, is_active) VALUES (?, 1, 1)",
  );
  const addMapping = database.prepare(
    "INSERT INTO supplier_taxonomy_legacy_item_mappings VALUES (?, ?)",
  );
  const addImport = database.prepare(
    "INSERT INTO supplier_taxonomy_legacy_imports VALUES (?, ?, ?)",
  );
  for (let id = 1; id <= 11; id++) {
    addOldCategory.run(1000 + id, `heading-${id}`, null);
    database.prepare("INSERT INTO groups VALUES (?, ?)").run(1000 + id, `group-${id}`);
  }
  for (let id = 1; id <= 280; id++) {
    const parentId = 1001 + (id % 11);
    addOldCategory.run(id, `legacy-${id}`, parentId);
    addTaxonomyItem.run(id);
    addMapping.run(id, id);
    addImport.run(id, id, id <= 153 ? "imported" : "already_mapped");
  }
  database.prepare("INSERT INTO requests VALUES (1, 1)").run();
  database.prepare("INSERT INTO supplier_request_contact_logs VALUES (1, 1)").run();
  database.prepare("INSERT INTO item_category_aliases VALUES ('دقيق', 1)").run();
  database.prepare("INSERT INTO category_tags VALUES (1, 1001)").run();
  database.prepare("INSERT INTO supplier_categories VALUES (1, 1)").run();
  database.prepare("INSERT INTO supplier_taxonomy_item_suppliers VALUES (1, 1)").run();
  return database;
}

test("archives and retires reviewed legacy categories atomically and idempotently", () => {
  const database = createDatabase();
  assert.equal(isLegacyItemCategoriesRetired(database), false);

  const result = retireLegacyItemCategories(database, "2026-09-27T00:00:00.000Z");

  assert.deepEqual(result, {
    alreadyRetired: false,
    archivedItemCategories: 291,
    archivedGroups: 11,
    archivedAliases: 1,
    archivedSupplierLinks: 1,
    archivedCategoryTags: 1,
  });
  assert.equal(isLegacyItemCategoriesRetired(database), true);
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS count FROM item_categories").get() as { count: number }).count,
    0,
  );
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS count FROM requests").get() as { count: number }).count,
    1,
  );
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS count FROM supplier_request_contact_logs").get() as { count: number }).count,
    1,
  );
  assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
  const secondRun = retireLegacyItemCategories(database, "2026-09-28T00:00:00.000Z");
  assert.deepEqual(secondRun, { ...result, alreadyRetired: true });
});

test("rolls archives and source deletions back when a delete fails", () => {
  const database = createDatabase();
  database.exec(`
    CREATE TRIGGER reject_legacy_category_delete
    BEFORE DELETE ON item_categories
    BEGIN
      SELECT RAISE(ABORT, 'injected category delete failure');
    END;
  `);

  assert.throws(() => retireLegacyItemCategories(database), /injected category delete failure/);
  assert.equal(isLegacyItemCategoriesRetired(database), false);
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS count FROM item_categories").get() as { count: number }).count,
    291,
  );
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS count FROM groups").get() as { count: number }).count,
    11,
  );
  assert.equal(
    (database.prepare(`
      SELECT COUNT(*) AS count FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'legacy_%_archive'
    `).get() as { count: number }).count,
    0,
  );
});

test("fails closed when request foreign keys still target legacy categories", () => {
  const database = createDatabase("item_categories");

  assert.throws(() => retireLegacyItemCategories(database), /requests\.category_id references supplier_taxonomy_items/);
  assert.equal(isLegacyItemCategoriesRetired(database), false);
  assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS count FROM item_categories").get() as { count: number }).count,
    291,
  );
});

test("fails closed for an alias not supported by the new resolver", () => {
  const database = createDatabase();
  database.prepare("INSERT INTO item_category_aliases VALUES (?, ?)").run("unreviewed alias", 1);

  assert.throws(() => retireLegacyItemCategories(database), /new resolver does not cover aliases/);
  assert.equal(isLegacyItemCategoriesRetired(database), false);
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS count FROM item_categories").get() as { count: number }).count,
    291,
  );
});

test("requires foreign keys to remain enabled", () => {
  const database = createDatabase();
  database.exec("PRAGMA foreign_keys = OFF");
  assert.throws(() => retireLegacyItemCategories(database), /requires foreign-key enforcement/);
  database.exec("PRAGMA foreign_keys = ON");
});

test("records the stable retirement migration identifier", () => {
  assert.equal(legacyItemCategoriesRetirementMarker, "legacy-item-categories-retired-v1");
});