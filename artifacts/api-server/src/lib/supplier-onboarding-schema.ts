import type { DatabaseSync } from "node:sqlite";

type Column = { name: string };

function hasColumn(db: DatabaseSync, table: string, name: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Column[];
  return columns.some((column) => column.name === name);
}

/**
 * Adds the staged-registration fields without replacing the existing request
 * history or the legacy supplier_categories links.
 */
export function ensureSupplierOnboardingSchema(db: DatabaseSync): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    if (!hasColumn(db, "supplier_categories", "is_approved")) {
      db.exec(`
        ALTER TABLE supplier_categories
        ADD COLUMN is_approved INTEGER NOT NULL DEFAULT 0
        CHECK (is_approved IN (0, 1))
      `);
    }

    if (!hasColumn(db, "supplier_requests", "supplier_id")) {
      db.exec(`
        ALTER TABLE supplier_requests
        ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL
      `);
      db.exec(`
        UPDATE supplier_requests
        SET supplier_id = (
          SELECT supplier.id FROM suppliers supplier
          WHERE supplier.request_id = supplier_requests.id
        )
        WHERE (
          SELECT COUNT(*) FROM suppliers supplier
          WHERE supplier.request_id = supplier_requests.id
        ) = 1
      `);
    }
    if (!hasColumn(db, "supplier_requests", "selected_categories")) {
      db.exec(`
        ALTER TABLE supplier_requests
        ADD COLUMN selected_categories TEXT NOT NULL DEFAULT '[]'
        CHECK (
          CASE WHEN json_valid(selected_categories)
            THEN json_type(selected_categories) = 'array'
            ELSE 0
          END
        )
      `);
    }
    if (!hasColumn(db, "supplier_requests", "admin_notes")) {
      db.exec("ALTER TABLE supplier_requests ADD COLUMN admin_notes TEXT");
      if (hasColumn(db, "supplier_requests", "admin_note")) {
        db.exec("UPDATE supplier_requests SET admin_notes = admin_note WHERE admin_note IS NOT NULL");
      }
    }

    // A JSON array cannot carry SQLite foreign keys for its individual IDs.
    // This request-scoped table is the authoritative relational place for
    // proposed selections from the current supplier taxonomy.
    db.exec(`
      CREATE TABLE IF NOT EXISTS supplier_category_selections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER NOT NULL REFERENCES supplier_requests(id) ON DELETE CASCADE,
        supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
        category_id INTEGER NOT NULL REFERENCES supplier_taxonomy_nodes(id) ON DELETE RESTRICT,
        is_approved INTEGER NOT NULL DEFAULT 0 CHECK (is_approved IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (request_id, category_id)
      );
      CREATE INDEX IF NOT EXISTS idx_supplier_category_selections_category
        ON supplier_category_selections (category_id, is_approved);
      CREATE INDEX IF NOT EXISTS idx_supplier_category_selections_supplier
        ON supplier_category_selections (supplier_id, is_approved);
    `);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}