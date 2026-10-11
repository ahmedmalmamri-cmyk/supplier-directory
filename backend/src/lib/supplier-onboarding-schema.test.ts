import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ensureSupplierOnboardingSchema } from "./supplier-onboarding-schema";

test("adds staging fields without losing existing supplier registration data", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE suppliers (id INTEGER PRIMARY KEY, request_id INTEGER);
      CREATE TABLE item_categories (id INTEGER PRIMARY KEY);
      CREATE TABLE supplier_taxonomy_nodes (id INTEGER PRIMARY KEY);
      CREATE TABLE supplier_requests (
        id INTEGER PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'pending',
        admin_note TEXT,
        reviewed_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE supplier_categories (
        supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
        item_category_id INTEGER NOT NULL REFERENCES item_categories(id),
        PRIMARY KEY (supplier_id, item_category_id)
      );
      INSERT INTO suppliers (id) VALUES (7);
      INSERT INTO suppliers (id, request_id) VALUES (8, 4);
      INSERT INTO item_categories (id) VALUES (8);
      INSERT INTO supplier_taxonomy_nodes (id) VALUES (12);
      INSERT INTO supplier_requests (id, status, admin_note, created_at)
        VALUES (3, 'pending_review', 'ملاحظة سابقة', '2026-01-01T00:00:00Z');
      INSERT INTO supplier_requests (id, status, created_at)
        VALUES (4, 'approved', '2026-01-01T00:00:00Z');
      INSERT INTO supplier_categories (supplier_id, item_category_id) VALUES (7, 8);
    `);

    ensureSupplierOnboardingSchema(db);
    ensureSupplierOnboardingSchema(db);

    const legacyLink = db.prepare(
      "SELECT supplier_id, item_category_id, is_approved FROM supplier_categories",
    ).get() as { supplier_id: number; item_category_id: number; is_approved: number };
    assert.deepEqual({ ...legacyLink }, { supplier_id: 7, item_category_id: 8, is_approved: 0 });

    const existingRequest = db.prepare(`
      SELECT status, admin_note, admin_notes, selected_categories, supplier_id, created_at
      FROM supplier_requests WHERE id = 3
    `).get() as Record<string, unknown>;
    assert.equal(existingRequest.status, "pending_review");
    assert.equal(existingRequest.admin_note, "ملاحظة سابقة");
    assert.equal(existingRequest.admin_notes, "ملاحظة سابقة");
    assert.equal(existingRequest.selected_categories, "[]");
    assert.equal(existingRequest.supplier_id, null);
    assert.equal(existingRequest.created_at, "2026-01-01T00:00:00Z");
    assert.equal(
      (db.prepare("SELECT supplier_id FROM supplier_requests WHERE id = 4").get() as { supplier_id: number }).supplier_id,
      8,
    );

    db.prepare("UPDATE supplier_requests SET supplier_id = ? WHERE id = 3").run(7);
    db.prepare("UPDATE supplier_requests SET selected_categories = ? WHERE id = 3")
      .run(JSON.stringify([12]));
    assert.throws(() => db.prepare(
      "UPDATE supplier_requests SET supplier_id = 999 WHERE id = 3",
    ).run(), /FOREIGN KEY/);
    assert.throws(() => db.prepare(
      "UPDATE supplier_requests SET selected_categories = 'invalid json' WHERE id = 3",
    ).run(), /CHECK constraint/);
    assert.throws(() => db.prepare(
      "UPDATE supplier_requests SET selected_categories = '{}' WHERE id = 3",
    ).run(), /CHECK constraint/);

    db.prepare(`
      INSERT INTO supplier_category_selections (request_id, supplier_id, category_id)
      VALUES (3, 7, 12)
    `).run();
    const selection = db.prepare(`
      SELECT request_id, supplier_id, category_id, is_approved, created_at
      FROM supplier_category_selections
    `).get() as {
      request_id: number;
      supplier_id: number;
      category_id: number;
      is_approved: number;
      created_at: string;
    };
    assert.equal(selection.category_id, 12);
    assert.equal(selection.is_approved, 0);
    assert.ok(selection.created_at);
    assert.throws(() => db.prepare(`
      INSERT INTO supplier_category_selections (request_id, supplier_id, category_id)
      VALUES (3, 7, 999)
    `).run(), /FOREIGN KEY/);
    assert.throws(() => db.prepare(`
      INSERT INTO supplier_category_selections (request_id, supplier_id, category_id)
      VALUES (999, 7, 12)
    `).run(), /FOREIGN KEY/);
    assert.throws(() => db.prepare(`
      UPDATE supplier_category_selections SET is_approved = 2
    `).run(), /CHECK constraint/);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally {
    db.close();
  }
});