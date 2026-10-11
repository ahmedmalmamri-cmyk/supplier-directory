import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  migrateRequestsCategoryToSupplierTaxonomy,
  requestsTaxonomyCategoryMigrationName,
} from "./requests-taxonomy-category-migration.ts";

function createDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE buyer_users (id INTEGER PRIMARY KEY);
    CREATE TABLE item_categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE supplier_taxonomy_nodes (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE supplier_taxonomy_items (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES supplier_taxonomy_nodes(id)
    );
    CREATE TABLE supplier_taxonomy_legacy_item_mappings (
      legacy_item_category_id INTEGER PRIMARY KEY,
      taxonomy_item_id INTEGER NOT NULL REFERENCES supplier_taxonomy_items(id),
      reviewed_at TEXT NOT NULL
    );
    CREATE TABLE directory_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_id INTEGER NOT NULL REFERENCES buyer_users(id),
      category_id INTEGER NOT NULL REFERENCES item_categories(id),
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      description TEXT NOT NULL,
      quantity REAL NOT NULL CHECK (typeof(quantity) IN ('integer', 'real') AND quantity > 0),
      unit TEXT NOT NULL CHECK (unit IN ('كيلو', 'كرتون', 'كيس', 'علبة')),
      frequency TEXT NOT NULL CHECK (frequency IN ('مرة واحدة', 'أسبوعي', 'شهري')),
      city TEXT NOT NULL CHECK (length(trim(city)) > 0),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'expired')),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX idx_requests_buyer_status_created
      ON requests (buyer_id, status, created_at DESC);
    CREATE INDEX idx_requests_category_city_status_expires
      ON requests (category_id, city, status, expires_at);
    CREATE TABLE supplier_request_contact_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES requests(id),
      supplier_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      sent_at TEXT NOT NULL
    );
    CREATE INDEX idx_supplier_request_contacts_supplier_date
      ON supplier_request_contact_logs (supplier_id, sent_at);
    INSERT INTO buyer_users VALUES (1);
    INSERT INTO item_categories VALUES (101, 'طحين'), (102, 'سكر');
    INSERT INTO supplier_taxonomy_nodes VALUES (1, 'مواد أولية');
    INSERT INTO supplier_taxonomy_items VALUES (201, 'طحين', 1), (202, 'سكر', 1);
    INSERT INTO supplier_taxonomy_legacy_item_mappings
      VALUES (101, 201, 'reviewed'), (102, 202, 'reviewed');
    INSERT INTO requests
      (id, buyer_id, category_id, title, description, quantity, unit, frequency, city, status, created_at, expires_at)
    VALUES
      (4, 1, 101, 'احتياج طحين', 'طحين فاخر', 15, 'كيلو', 'أسبوعي', 'الرياض', 'active', 'created-1', 'expires-1'),
      (8, 1, 102, 'احتياج سكر', 'سكر أبيض', 4, 'كرتون', 'شهري', 'جدة', 'closed', 'created-2', 'expires-2');
    INSERT INTO supplier_request_contact_logs (request_id, supplier_id, message, sent_at)
    VALUES (4, 77, 'تم التواصل', 'contacted');
    UPDATE sqlite_sequence SET seq = 19 WHERE name = 'requests';
  `);
  return database;
}

function createFreshDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE buyer_users (id INTEGER PRIMARY KEY);
    CREATE TABLE supplier_taxonomy_nodes (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE supplier_taxonomy_items (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES supplier_taxonomy_nodes(id)
    );
    CREATE TABLE requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_id INTEGER NOT NULL REFERENCES buyer_users(id),
      category_id INTEGER NOT NULL REFERENCES supplier_taxonomy_items(id),
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      description TEXT NOT NULL,
      quantity REAL NOT NULL CHECK (typeof(quantity) IN ('integer', 'real') AND quantity > 0),
      unit TEXT NOT NULL CHECK (unit IN ('كيلو', 'كرتون', 'كيس', 'علبة')),
      frequency TEXT NOT NULL CHECK (frequency IN ('مرة واحدة', 'أسبوعي', 'شهري')),
      city TEXT NOT NULL CHECK (length(trim(city)) > 0),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'expired')),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX idx_requests_category_city_status_expires
      ON requests (category_id, city, status, expires_at);
    CREATE TABLE supplier_request_contact_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES requests(id),
      supplier_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      sent_at TEXT NOT NULL
    );
    INSERT INTO buyer_users VALUES (1);
    INSERT INTO supplier_taxonomy_nodes VALUES (1, 'مواد أولية');
    INSERT INTO supplier_taxonomy_items VALUES (201, 'طحين', 1);
    INSERT INTO requests
      (id, buyer_id, category_id, title, description, quantity, unit, frequency, city, status, created_at, expires_at)
    VALUES (4, 1, 201, 'احتياج طحين', 'طحين فاخر', 15, 'كيلو', 'أسبوعي', 'الرياض', 'active', 'created', 'expires');
  `);
  return database;
}

function requestRows(database: DatabaseSync) {
  return database.prepare(`
    SELECT id, buyer_id, category_id, title, description, quantity, unit,
      frequency, city, status, created_at, expires_at
    FROM requests ORDER BY id
  `).all().map((row) => ({ ...row }));
}

function categoryForeignKeyTarget(database: DatabaseSync) {
  const foreignKeys = database.prepare("PRAGMA foreign_key_list(requests)").all() as Array<{
    table: string;
    from: string;
  }>;
  return foreignKeys.find((foreignKey) => foreignKey.from === "category_id")?.table;
}

function indexDefinitions(database: DatabaseSync, table: string) {
  return database.prepare(`
    SELECT name, sql FROM sqlite_master
    WHERE type = 'index' AND tbl_name = ? ORDER BY name
  `).all(table).map((row) => ({ ...row }));
}

test("maps existing request categories and preserves rows, contact-log FK, indexes, and sequence", () => {
  const database = createDatabase();
  const oldRows = requestRows(database) as Array<Record<string, unknown>>;
  const requestIndexes = indexDefinitions(database, "requests");
  const contactIndexes = indexDefinitions(database, "supplier_request_contact_logs");

  const result = migrateRequestsCategoryToSupplierTaxonomy(database, "migrated-at");

  assert.deepEqual(result, { migrated: true, requestCount: 2 });
  assert.equal(categoryForeignKeyTarget(database), "supplier_taxonomy_items");
  assert.equal((database.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys, 1);
  assert.deepEqual(indexDefinitions(database, "requests"), requestIndexes);
  assert.deepEqual(indexDefinitions(database, "supplier_request_contact_logs"), contactIndexes);
  assert.deepEqual(
    database.prepare("PRAGMA foreign_key_list(supplier_request_contact_logs)").all()
      .filter((foreignKey) => (foreignKey as { from: string }).from === "request_id")
      .map((foreignKey) => (foreignKey as { table: string; to: string }).table + ":" +
        (foreignKey as { table: string; to: string }).to),
    ["requests:id"],
  );
  assert.deepEqual(
    requestRows(database),
    oldRows.map((row) => ({
      ...row,
      category_id: row.category_id === 101 ? 201 : 202,
    })),
  );
  assert.deepEqual(
    database.prepare("SELECT request_id, supplier_id, message, sent_at FROM supplier_request_contact_logs")
      .all().map((row) => ({ ...row })),
    [{ request_id: 4, supplier_id: 77, message: "تم التواصل", sent_at: "contacted" }],
  );
  assert.equal(
    (database.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'requests'").get() as { seq: number }).seq,
    19,
  );
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(
    (database.prepare("SELECT applied_at FROM directory_migrations WHERE name = ?")
      .get(requestsTaxonomyCategoryMigrationName) as { applied_at: string }).applied_at,
    "migrated-at",
  );

  const secondRun = migrateRequestsCategoryToSupplierTaxonomy(database, "second-run");
  assert.deepEqual(secondRun, { migrated: false, requestCount: 2 });
  assert.equal(requestRows(database).length, 2);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("records an idempotent migration marker for a fresh taxonomy-linked requests table", () => {
  const database = createFreshDatabase();
  const beforeRows = requestRows(database);

  const result = migrateRequestsCategoryToSupplierTaxonomy(database, "fresh-at");

  assert.deepEqual(result, { migrated: false, requestCount: 1 });
  assert.equal(categoryForeignKeyTarget(database), "supplier_taxonomy_items");
  assert.deepEqual(requestRows(database), beforeRows);
  assert.equal(
    (database.prepare("SELECT applied_at FROM directory_migrations WHERE name = ?")
      .get(requestsTaxonomyCategoryMigrationName) as { applied_at: string }).applied_at,
    "fresh-at",
  );
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((database.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys, 1);
  database.close();
});

test("fails closed on unmapped request categories without changing the old schema or rows", () => {
  const database = createDatabase();
  database.prepare("INSERT INTO item_categories VALUES (999, 'صنف بلا مطابقة')").run();
  database.prepare(`
    INSERT INTO requests
      (buyer_id, category_id, title, description, quantity, unit, frequency, city, status, created_at, expires_at)
    VALUES (1, 999, 'احتياج قديم', '', 1, 'كيلو', 'مرة واحدة', 'الدمام', 'active', 'created', 'expires')
  `).run();
  const oldRows = requestRows(database);

  assert.throws(
    () => migrateRequestsCategoryToSupplierTaxonomy(database, "migration-at"),
    /unmapped legacy categories/,
  );
  assert.equal(categoryForeignKeyTarget(database), "item_categories");
  assert.deepEqual(requestRows(database), oldRows);
  assert.equal(
    database.prepare("SELECT 1 FROM directory_migrations WHERE name = ?")
      .get(requestsTaxonomyCategoryMigrationName),
    undefined,
  );
  assert.equal((database.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys, 1);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("rolls back DDL errors and re-enables foreign keys", () => {
  const database = createDatabase();
  const oldRows = requestRows(database);
  database.exec("CREATE TABLE requests_taxonomy_category_new (reserved INTEGER)");

  assert.throws(
    () => migrateRequestsCategoryToSupplierTaxonomy(database, "migration-at"),
    /temporary table requests_taxonomy_category_new already exists/,
  );
  assert.equal(categoryForeignKeyTarget(database), "item_categories");
  assert.deepEqual(requestRows(database), oldRows);
  assert.equal(
    database.prepare("SELECT 1 FROM directory_migrations WHERE name = ?")
      .get(requestsTaxonomyCategoryMigrationName),
    undefined,
  );
  assert.equal((database.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys, 1);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});