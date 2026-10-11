import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE buyer_users (id INTEGER PRIMARY KEY);
    CREATE TABLE suppliers (id INTEGER PRIMARY KEY);
    CREATE TABLE item_availability_photo_uploads (
      object_path TEXT PRIMARY KEY,
      buyer_id INTEGER NOT NULL REFERENCES buyer_users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE item_availability_inquiries (
      id INTEGER PRIMARY KEY,
      buyer_id INTEGER NOT NULL REFERENCES buyer_users(id),
      photo_path TEXT REFERENCES item_availability_photo_uploads(object_path) ON DELETE SET NULL
    );
    CREATE UNIQUE INDEX idx_item_availability_inquiries_id_buyer
      ON item_availability_inquiries (id, buyer_id);
    CREATE TABLE item_availability_recipients (
      inquiry_id INTEGER NOT NULL REFERENCES item_availability_inquiries(id) ON DELETE CASCADE,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      PRIMARY KEY (inquiry_id, supplier_id)
    );
    CREATE TABLE contact_logs (
      id INTEGER PRIMARY KEY,
      buyer_id INTEGER NOT NULL REFERENCES buyer_users(id),
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      message TEXT NOT NULL,
      message_id TEXT NOT NULL UNIQUE,
      sent_at TEXT NOT NULL,
      status TEXT NOT NULL,
      UNIQUE (id, buyer_id, supplier_id)
    );
    CREATE TABLE item_availability_contact_logs (
      contact_log_id INTEGER PRIMARY KEY,
      inquiry_id INTEGER NOT NULL,
      buyer_id INTEGER NOT NULL,
      supplier_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (contact_log_id, buyer_id, supplier_id)
        REFERENCES contact_logs(id, buyer_id, supplier_id) ON DELETE CASCADE,
      FOREIGN KEY (inquiry_id)
        REFERENCES item_availability_inquiries(id) ON DELETE CASCADE,
      FOREIGN KEY (inquiry_id, buyer_id)
        REFERENCES item_availability_inquiries(id, buyer_id) ON DELETE CASCADE,
      FOREIGN KEY (inquiry_id, supplier_id)
        REFERENCES item_availability_recipients(inquiry_id, supplier_id) ON DELETE CASCADE
    );
    INSERT INTO buyer_users VALUES (1), (2);
    INSERT INTO suppliers VALUES (10);
  `);
  return db;
}

function consumePhotoUpload(db: DatabaseSync, buyerId: number, objectPath: string, now: string) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const upload = db.prepare(`
      SELECT buyer_id AS buyerId, expires_at AS expiresAt, consumed_at AS consumedAt
      FROM item_availability_photo_uploads
      WHERE object_path = ?
    `).get(objectPath) as {
      buyerId: number;
      expiresAt: string;
      consumedAt: string | null;
    } | undefined;
    if (!upload || upload.buyerId !== buyerId || upload.consumedAt || upload.expiresAt <= now) {
      db.exec("ROLLBACK");
      return false;
    }
    const result = db.prepare(`
      UPDATE item_availability_photo_uploads
      SET consumed_at = ?
      WHERE object_path = ? AND buyer_id = ?
        AND consumed_at IS NULL AND expires_at > ?
    `).run(now, objectPath, buyerId, now);
    if (result.changes !== 1) {
      db.exec("ROLLBACK");
      return false;
    }
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

test("photo uploads cannot be claimed by another buyer or consumed twice", () => {
  const db = createDatabase();
  const path = "/objects/item-inquiry-photos/18cf3078-a287-46bd-9c8c-ea9e7cc8cf43";
  db.prepare(`
    INSERT INTO item_availability_photo_uploads
      (object_path, buyer_id, expires_at, consumed_at, created_at)
    VALUES (?, 1, ?, NULL, ?)
  `).run(path, "2030-05-01T12:15:00.000Z", "2030-05-01T12:00:00.000Z");

  assert.equal(consumePhotoUpload(db, 2, path, "2030-05-01T12:01:00.000Z"), false);
  assert.equal(
    (db.prepare("SELECT consumed_at AS consumedAt FROM item_availability_photo_uploads WHERE object_path = ?")
      .get(path) as { consumedAt: string | null }).consumedAt,
    null,
  );
  assert.equal(consumePhotoUpload(db, 1, path, "2030-05-01T12:02:00.000Z"), true);
  assert.equal(consumePhotoUpload(db, 1, path, "2030-05-01T12:03:00.000Z"), false);
  db.close();
});

test("expired photo upload paths cannot be claimed", () => {
  const db = createDatabase();
  const path = "/objects/item-inquiry-photos/18cf3078-a287-46bd-9c8c-ea9e7cc8cf43";
  db.prepare(`
    INSERT INTO item_availability_photo_uploads
      (object_path, buyer_id, expires_at, consumed_at, created_at)
    VALUES (?, 1, ?, NULL, ?)
  `).run(path, "2030-05-01T12:15:00.000Z", "2030-05-01T12:00:00.000Z");

  assert.equal(consumePhotoUpload(db, 1, path, "2030-05-01T12:15:00.000Z"), false);
  db.close();
});

test("availability contact records must reference the matching inquiry recipient and contact log", () => {
  const db = createDatabase();
  db.exec(`
    INSERT INTO item_availability_inquiries (id, buyer_id) VALUES (1, 1);
    INSERT INTO item_availability_recipients (inquiry_id, supplier_id) VALUES (1, 10);
    INSERT INTO contact_logs
      (id, buyer_id, supplier_id, message, message_id, sent_at, status)
    VALUES
      (20, 1, 10, 'contact', 'MSG-20', '2030-05-01T12:00:00.000Z', 'sent'),
      (21, 2, 10, 'other contact', 'MSG-21', '2030-05-01T12:01:00.000Z', 'sent');
  `);

  db.prepare(`
    INSERT INTO item_availability_contact_logs
      (contact_log_id, inquiry_id, buyer_id, supplier_id, created_at)
    VALUES (20, 1, 1, 10, '2030-05-01T12:00:00.000Z')
  `).run();
  assert.throws(() => db.prepare(`
    INSERT INTO item_availability_contact_logs
      (contact_log_id, inquiry_id, buyer_id, supplier_id, created_at)
    VALUES (21, 1, 2, 10, '2030-05-01T12:01:00.000Z')
  `).run(), /FOREIGN KEY constraint failed/);
  db.close();
});