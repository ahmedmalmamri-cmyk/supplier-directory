import type { DatabaseSync } from "node:sqlite";

export const requestsTaxonomyCategoryMigrationName =
  "requests-category-supplier-taxonomy-v1";

const temporaryRequestsTable = "requests_taxonomy_category_new";

type ForeignKeyRow = {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string | null;
  on_update: string;
  on_delete: string;
  match: string;
};

type MigrationRow = { name: string };
type SequenceRow = { seq: number };
type CategoryForeignKey = { table: string };

export type RequestsTaxonomyCategoryMigrationResult = {
  migrated: boolean;
  requestCount: number;
};

type RequestRow = {
  id: number;
  buyer_id: number;
  category_id: number;
  title: string;
  description: string;
  quantity: number;
  unit: string;
  frequency: string;
  city: string;
  status: string;
  created_at: string;
  expires_at: string;
};

function tableExists(database: DatabaseSync, name: string): boolean {
  return Boolean(database.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(name));
}

function categoryForeignKey(database: DatabaseSync): CategoryForeignKey | undefined {
  const foreignKeys = database.prepare("PRAGMA foreign_key_list(requests)").all() as ForeignKeyRow[];
  const categoryKeys = foreignKeys.filter((foreignKey) => foreignKey.from === "category_id");
  if (categoryKeys.length > 1) {
    throw new Error("Requests.category_id has multiple foreign keys");
  }
  return categoryKeys[0] ? { table: categoryKeys[0].table } : undefined;
}

function assertTaxonomyForeignKey(database: DatabaseSync): void {
  if (categoryForeignKey(database)?.table !== "supplier_taxonomy_items") {
    throw new Error(
      "Requests.category_id must reference supplier_taxonomy_items before its migration is marked applied",
    );
  }
}

function assertNoForeignKeyViolations(database: DatabaseSync): void {
  const violations = database.prepare("PRAGMA foreign_key_check").all();
  if (violations.length) {
    throw new Error(
      `Requests taxonomy migration failed foreign-key validation (${violations.length} violation(s))`,
    );
  }
}

function assertRequestsContactLogForeignKey(database: DatabaseSync): void {
  if (!tableExists(database, "supplier_request_contact_logs")) return;
  const foreignKeys = database
    .prepare("PRAGMA foreign_key_list(supplier_request_contact_logs)")
    .all() as ForeignKeyRow[];
  if (!foreignKeys.some((foreignKey) =>
    foreignKey.table === "requests" && foreignKey.from === "request_id" && foreignKey.to === "id")) {
    throw new Error("Supplier request contact logs no longer reference requests(id)");
  }
}

function createRequestsTable(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE ${temporaryRequestsTable} (
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
    )
  `);
}

/**
 * Repoints requests.category_id to the reviewed supplier taxonomy while
 * retaining request IDs, request data, dependent contact logs, indexes and
 * triggers. Legacy category IDs must have an explicit mapping before any
 * schema change starts.
 */
export function migrateRequestsCategoryToSupplierTaxonomy(
  database: DatabaseSync,
  now = new Date().toISOString(),
): RequestsTaxonomyCategoryMigrationResult {
  let transactionStarted = false;
  try {
    if (!now.trim()) throw new Error("A non-empty migration timestamp is required");
    if ((database.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys !== 1) {
      throw new Error("Requests taxonomy migration requires foreign_keys to be enabled");
    }
    if (!tableExists(database, "requests")) {
      throw new Error("Cannot migrate requests.category_id because the requests table does not exist");
    }
    if (!tableExists(database, "supplier_taxonomy_items")) {
      throw new Error("Cannot migrate requests.category_id before supplier_taxonomy_items exists");
    }

    // SQLite ignores changes to foreign_keys inside a transaction, so disable
    // it before BEGIN and verify that the setting actually changed.
    database.exec("PRAGMA foreign_keys = OFF");
    const foreignKeysDisabled = (database.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number })
      .foreign_keys === 0;
    if (!foreignKeysDisabled) {
      throw new Error("Cannot migrate requests.category_id while a transaction is active");
    }

    database.exec("BEGIN IMMEDIATE");
    transactionStarted = true;

    database.exec(`
      CREATE TABLE IF NOT EXISTS directory_migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `);
    const applied = database.prepare(
      "SELECT name FROM directory_migrations WHERE name = ?",
    ).get(requestsTaxonomyCategoryMigrationName) as MigrationRow | undefined;
    const currentForeignKey = categoryForeignKey(database);

    if (applied) {
      assertTaxonomyForeignKey(database);
      assertRequestsContactLogForeignKey(database);
      assertNoForeignKeyViolations(database);
      const count = (database.prepare("SELECT COUNT(*) AS count FROM requests").get() as { count: number }).count;
      database.exec("COMMIT");
      transactionStarted = false;
      return { migrated: false, requestCount: count };
    }

    if (!currentForeignKey) {
      throw new Error("Requests.category_id has no foreign key");
    }

    const beforeRows = database.prepare(`
      SELECT id, buyer_id, category_id, title, description, quantity, unit,
        frequency, city, status, created_at, expires_at
      FROM requests ORDER BY id
    `).all() as RequestRow[];
    const previousSequence = database.prepare(
      "SELECT seq FROM sqlite_sequence WHERE name = 'requests'",
    ).get() as SequenceRow | undefined;

    if (currentForeignKey.table === "item_categories") {
      const unmapped = database.prepare(`
        SELECT request.id, request.category_id
        FROM requests request
        LEFT JOIN supplier_taxonomy_legacy_item_mappings mapping
          ON mapping.legacy_item_category_id = request.category_id
        LEFT JOIN supplier_taxonomy_items taxonomy_item
          ON taxonomy_item.id = mapping.taxonomy_item_id
        WHERE mapping.taxonomy_item_id IS NULL OR taxonomy_item.id IS NULL
        ORDER BY request.id
      `).all() as Array<{ id: number; category_id: number }>;
      if (unmapped.length) {
        const summary = unmapped
          .slice(0, 10)
          .map((row) => `${row.id}:${row.category_id}`)
          .join(", ");
        throw new Error(
          `Cannot migrate requests with unmapped legacy categories (${unmapped.length}): ${summary}`,
        );
      }

      if (tableExists(database, temporaryRequestsTable)) {
        throw new Error(`Cannot migrate requests: temporary table ${temporaryRequestsTable} already exists`);
      }

      const indexes = database.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type = 'index' AND tbl_name = 'requests' AND sql IS NOT NULL
        ORDER BY name
      `).all() as Array<{ sql: string }>;
      const triggers = database.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type = 'trigger' AND tbl_name = 'requests' AND sql IS NOT NULL
        ORDER BY name
      `).all() as Array<{ sql: string }>;

      createRequestsTable(database);
      database.prepare(`
        INSERT INTO ${temporaryRequestsTable}
          (id, buyer_id, category_id, title, description, quantity, unit,
           frequency, city, status, created_at, expires_at)
        SELECT request.id, request.buyer_id, mapping.taxonomy_item_id,
          request.title, request.description, request.quantity, request.unit,
          request.frequency, request.city, request.status, request.created_at, request.expires_at
        FROM requests request
        JOIN supplier_taxonomy_legacy_item_mappings mapping
          ON mapping.legacy_item_category_id = request.category_id
        JOIN supplier_taxonomy_items taxonomy_item
          ON taxonomy_item.id = mapping.taxonomy_item_id
        ORDER BY request.id
      `).run();

      database.exec(`
        DROP TABLE requests;
        ALTER TABLE ${temporaryRequestsTable} RENAME TO requests;
      `);
      for (const { sql } of indexes) database.exec(sql);
      for (const { sql } of triggers) database.exec(sql);

      const afterRows = database.prepare(`
        SELECT id, buyer_id, category_id, title, description, quantity, unit,
          frequency, city, status, created_at, expires_at
        FROM requests ORDER BY id
      `).all() as RequestRow[];
      if (beforeRows.length !== afterRows.length) {
        throw new Error(
          `Requests migration changed row count: expected ${beforeRows.length}, found ${afterRows.length}`,
        );
      }
      for (let index = 0; index < beforeRows.length; index++) {
        const before = beforeRows[index];
        const after = afterRows[index];
        const expectedCategoryId = database.prepare(`
          SELECT taxonomy_item_id AS id
          FROM supplier_taxonomy_legacy_item_mappings
          WHERE legacy_item_category_id = ?
        `).get(before.category_id) as { id: number } | undefined;
        if (!expectedCategoryId || after.category_id !== expectedCategoryId.id) {
          throw new Error(`Requests migration did not preserve request ${before.id}`);
        }
        const expectedRow = { ...before, category_id: expectedCategoryId.id };
        if (JSON.stringify(after) !== JSON.stringify(expectedRow)) {
          throw new Error(`Requests migration changed request data for request ${before.id}`);
        }
      }

      if (previousSequence) {
        const currentSequence = database.prepare(
          "SELECT seq FROM sqlite_sequence WHERE name = 'requests'",
        ).get() as SequenceRow | undefined;
        const sequence = Math.max(previousSequence.seq, currentSequence?.seq ?? 0);
        if (currentSequence) {
          database.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'requests'").run(sequence);
        } else {
          database.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('requests', ?)").run(sequence);
        }
      }
    } else if (currentForeignKey.table !== "supplier_taxonomy_items") {
      throw new Error(
        `Cannot migrate requests.category_id from unsupported table ${currentForeignKey.table}`,
      );
    }

    assertTaxonomyForeignKey(database);
    assertRequestsContactLogForeignKey(database);
    assertNoForeignKeyViolations(database);
    database.prepare(
      "INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)",
    ).run(requestsTaxonomyCategoryMigrationName, now);
    database.exec("COMMIT");
    transactionStarted = false;

    return {
      migrated: currentForeignKey.table === "item_categories",
      requestCount: beforeRows.length,
    };
  } catch (error) {
    if (transactionStarted) database.exec("ROLLBACK");
    throw error;
  } finally {
    // Always leave the connection safe for the rest of the application, even
    // when preflight, DDL, or foreign_key_check fails.
    database.exec("PRAGMA foreign_keys = ON");
  }
}