import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  applyApprovedLegacyItemAssignments,
  approvedLegacyItemAssignments,
} from "./approved-legacy-item-assignments.ts";

const mergedAliasName = "سمن نباتي";

function createDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE item_categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id INTEGER REFERENCES item_categories(id)
    );
    CREATE TABLE supplier_categories (
      supplier_id INTEGER NOT NULL,
      item_category_id INTEGER NOT NULL
    );
    CREATE TABLE supplier_taxonomy_nodes (
      id INTEGER PRIMARY KEY,
      parent_id INTEGER REFERENCES supplier_taxonomy_nodes(id),
      name TEXT NOT NULL,
      is_active INTEGER NOT NULL
    );
    CREATE TABLE supplier_taxonomy_items (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      category_id INTEGER NOT NULL REFERENCES supplier_taxonomy_nodes(id),
      is_active INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE items_categories (
      id INTEGER PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES supplier_taxonomy_items(id),
      category_id INTEGER NOT NULL REFERENCES supplier_taxonomy_nodes(id),
      is_primary INTEGER NOT NULL CHECK (is_primary IN (0, 1)),
      created_at TEXT NOT NULL,
      UNIQUE (item_id, category_id)
    );
    CREATE UNIQUE INDEX one_primary_category_per_item
      ON items_categories(item_id) WHERE is_primary = 1;
    CREATE TABLE supplier_taxonomy_item_suppliers (
      supplier_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL REFERENCES supplier_taxonomy_items(id),
      created_at TEXT NOT NULL,
      PRIMARY KEY (supplier_id, item_id)
    );
    CREATE TABLE supplier_taxonomy_legacy_item_mappings (
      legacy_item_category_id INTEGER PRIMARY KEY,
      taxonomy_item_id INTEGER NOT NULL REFERENCES supplier_taxonomy_items(id),
      reviewed_at TEXT NOT NULL
    );
    CREATE TABLE supplier_taxonomy_legacy_imports (
      legacy_item_category_id INTEGER PRIMARY KEY,
      taxonomy_item_id INTEGER REFERENCES supplier_taxonomy_items(id),
      outcome TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const nodeIdByName = new Map<string, number>();
  for (const assignment of approvedLegacyItemAssignments) {
    if (!nodeIdByName.has(assignment.destinationNodeName)) {
      const id = nodeIdByName.size + 1;
      database.prepare(`
        INSERT INTO supplier_taxonomy_nodes (id, parent_id, name, is_active)
        VALUES (?, NULL, ?, 1)
      `).run(id, assignment.destinationNodeName);
      nodeIdByName.set(assignment.destinationNodeName, id);
    }
  }
  const temporaryNodeId = 1000;
  database.prepare(`
    INSERT INTO supplier_taxonomy_nodes (id, parent_id, name, is_active)
    VALUES (?, NULL, 'أصناف غير مصنفة', 0)
  `).run(temporaryNodeId);

  const insertOldItem = database.prepare(
    "INSERT INTO item_categories (id, name, parent_id) VALUES (?, ?, NULL)",
  );
  const insertTaxonomyItem = database.prepare(`
    INSERT INTO supplier_taxonomy_items (id, name, category_id, is_active, updated_at)
    VALUES (?, ?, ?, ?, 'original')
  `);
  const insertPrimaryMembership = database.prepare(`
    INSERT INTO items_categories (item_id, category_id, is_primary, created_at)
    VALUES (?, ?, 1, 'original')
  `);
  const insertMarker = database.prepare(`
    INSERT INTO supplier_taxonomy_legacy_imports
      (legacy_item_category_id, taxonomy_item_id, outcome, created_at)
    VALUES (?, ?, ?, 'original')
  `);
  const insertMapping = database.prepare(`
    INSERT INTO supplier_taxonomy_legacy_item_mappings
      (legacy_item_category_id, taxonomy_item_id, reviewed_at)
    VALUES (?, ?, 'original')
  `);

  const mergedAliasIndex = approvedLegacyItemAssignments.findIndex(
    assignment => assignment.oldItemName === mergedAliasName,
  );
  const canonicalIndex = approvedLegacyItemAssignments.findIndex(
    assignment => assignment.oldItemName === "سمن",
  );
  if (mergedAliasIndex < 0 || canonicalIndex < 0) {
    throw new Error("The approved fixture must contain the reviewed ghee alias and canonical name");
  }

  for (let index = 0; index < approvedLegacyItemAssignments.length; index++) {
    const assignment = approvedLegacyItemAssignments[index];
    const id = index + 1;
    insertOldItem.run(id, assignment.oldItemName);
    if (assignment.oldItemName === mergedAliasName) continue;
    insertTaxonomyItem.run(id, assignment.oldItemName, temporaryNodeId, 0);
    insertPrimaryMembership.run(id, temporaryNodeId);
    insertMarker.run(id, id, "imported");
    insertMapping.run(id, id);
  }
  const mergedAliasLegacyId = mergedAliasIndex + 1;
  const canonicalItemId = canonicalIndex + 1;
  insertMarker.run(mergedAliasLegacyId, canonicalItemId, "already_mapped");
  insertMapping.run(mergedAliasLegacyId, canonicalItemId);

  const existingNodeId = [...nodeIdByName.values()][0];
  for (let index = 0; index < 127; index++) {
    const duplicateLegacyId = 1001 + index;
    const duplicateItemId = 2001 + index;
    const duplicateName = `صنف موجود مسبقاً ${index + 1}`;
    insertOldItem.run(duplicateLegacyId, duplicateName);
    insertTaxonomyItem.run(duplicateItemId, duplicateName, existingNodeId, 1);
    insertPrimaryMembership.run(duplicateItemId, existingNodeId);
    insertMarker.run(duplicateLegacyId, duplicateItemId, "duplicate");
  }
  database.prepare(`
    INSERT INTO supplier_taxonomy_item_suppliers (supplier_id, item_id, created_at)
    VALUES (77, ?, 'original supplier link')
  `).run(2001);

  return database;
}

test("approved assignments are idempotent, preserve sources and duplicate items, and do not copy duplicate supplier links", () => {
  const database = createDatabase();
  const sourceCountBefore = (database.prepare(
    "SELECT COUNT(*) AS count FROM item_categories",
  ).get() as { count: number }).count;
  const duplicateBefore = database.prepare(`
    SELECT category_id AS categoryId, is_active AS active
    FROM supplier_taxonomy_items WHERE id = 2001
  `).get() as { categoryId: number; active: number };

  const first = applyApprovedLegacyItemAssignments(database, "approved-at");
  assert.deepEqual(first, {
    sourceItemCount: 280,
    importedItemCount: 152,
    importedItemsUpdated: 152,
    importedItemsAlreadyAssigned: 0,
    duplicateItemCount: 128,
    duplicateMappingsAdded: 127,
    duplicateMappingsAlreadyReviewed: 1,
  });
  const activeItems = database.prepare(`
    SELECT COUNT(*) AS count FROM supplier_taxonomy_items
    WHERE id BETWEEN 1 AND 153 AND is_active = 1
  `).get() as { count: number };
  assert.equal(activeItems.count, 152);
  const primaryLinks = database.prepare(`
    SELECT i.name AS itemName, n.name AS nodeName, ic.is_primary AS isPrimary
    FROM supplier_taxonomy_items i
    JOIN items_categories ic ON ic.item_id = i.id
    JOIN supplier_taxonomy_nodes n ON n.id = ic.category_id
    WHERE ic.is_primary = 1
    ORDER BY i.id
  `).all() as Array<{ itemName: string; nodeName: string; isPrimary: number }>;
  assert.equal(primaryLinks.length, 279);
  let primaryLinkIndex = 0;
  for (let index = 0; index < approvedLegacyItemAssignments.length; index++) {
    const assignment = approvedLegacyItemAssignments[index];
    if (assignment.oldItemName === mergedAliasName) continue;
    assert.equal(primaryLinks[primaryLinkIndex].itemName, assignment.oldItemName);
    assert.equal(primaryLinks[primaryLinkIndex].nodeName, assignment.destinationNodeName);
    assert.equal(primaryLinks[primaryLinkIndex].isPrimary, 1);
    primaryLinkIndex++;
  }
  assert.deepEqual(
    database.prepare(`
      SELECT category_id AS categoryId, is_active AS active
      FROM supplier_taxonomy_items WHERE id = 2001
    `).get(),
    duplicateBefore,
  );
  const duplicateMapping = database.prepare(`
    SELECT legacy_item_category_id AS legacyId, taxonomy_item_id AS itemId
    FROM supplier_taxonomy_legacy_item_mappings WHERE legacy_item_category_id = 1001
  `).get() as { legacyId: number; itemId: number };
  assert.equal(duplicateMapping.legacyId, 1001);
  assert.equal(duplicateMapping.itemId, 2001);
  assert.equal(
    (database.prepare(
      "SELECT COUNT(*) AS count FROM supplier_taxonomy_item_suppliers WHERE supplier_id = 77",
    ).get() as { count: number }).count,
    1,
  );
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS count FROM item_categories").get() as { count: number }).count,
    sourceCountBefore,
  );
  assert.deepEqual(applyApprovedLegacyItemAssignments(database, "approved-again"), {
    sourceItemCount: 280,
    importedItemCount: 152,
    importedItemsUpdated: 0,
    importedItemsAlreadyAssigned: 152,
    duplicateItemCount: 128,
    duplicateMappingsAdded: 0,
    duplicateMappingsAlreadyReviewed: 128,
  });
  database.close();
});

test("a reviewed duplicate remains mapped when its old taxonomy item is merged into a differently named canonical item", () => {
  const database = createDatabase();
  applyApprovedLegacyItemAssignments(database, "approved-at");
  const canonicalId = 3000;
  const nodeId = database.prepare(
    "SELECT id FROM supplier_taxonomy_nodes ORDER BY id LIMIT 1",
  ).get() as { id: number };
  database.prepare(`
    INSERT INTO supplier_taxonomy_items (id, name, category_id, is_active, updated_at)
    VALUES (?, 'اسم موحد', ?, 1, 'merged')
  `).run(canonicalId, nodeId.id);
  database.prepare(`
    INSERT INTO items_categories (item_id, category_id, is_primary, created_at)
    VALUES (?, ?, 1, 'merged')
  `).run(canonicalId, nodeId.id);
  database.prepare(`
    UPDATE supplier_taxonomy_legacy_item_mappings
    SET taxonomy_item_id = ? WHERE legacy_item_category_id = 1001
  `).run(canonicalId);
  database.prepare(`
    UPDATE supplier_taxonomy_legacy_imports
    SET taxonomy_item_id = ? WHERE legacy_item_category_id = 1001
  `).run(canonicalId);
  database.prepare(`
    INSERT OR IGNORE INTO supplier_taxonomy_item_suppliers (supplier_id, item_id, created_at)
    SELECT supplier_id, ?, created_at
    FROM supplier_taxonomy_item_suppliers WHERE item_id = 2001
  `).run(canonicalId);
  database.prepare("DELETE FROM supplier_taxonomy_item_suppliers WHERE item_id = 2001").run();
  database.prepare("DELETE FROM items_categories WHERE item_id = 2001").run();
  database.prepare("DELETE FROM supplier_taxonomy_items WHERE id = 2001").run();

  const repeated = applyApprovedLegacyItemAssignments(database, "approved-again");
  assert.equal(repeated.duplicateItemCount, 128);
  assert.equal(repeated.duplicateMappingsAlreadyReviewed, 128);
  assert.equal(
    (database.prepare(`
      SELECT taxonomy_item_id AS itemId
      FROM supplier_taxonomy_legacy_item_mappings WHERE legacy_item_category_id = 1001
    `).get() as { itemId: number }).itemId,
    canonicalId,
  );
  database.close();
});

test("a linked duplicate fails closed without changing sources or previously imported items", () => {
  const database = createDatabase();
  database.prepare(`
    INSERT INTO supplier_categories (supplier_id, item_category_id) VALUES (88, 1001)
  `).run();

  assert.throws(
    () => applyApprovedLegacyItemAssignments(database, "approved-at"),
    /has supplier links and cannot be mapped automatically/,
  );
  assert.equal(
    (database.prepare(`
      SELECT COUNT(*) AS count FROM supplier_taxonomy_items
      WHERE id BETWEEN 1 AND 153 AND is_active = 1
    `).get() as { count: number }).count,
    0,
  );
  assert.equal(
    (database.prepare(`
      SELECT COUNT(*) AS count FROM supplier_taxonomy_legacy_item_mappings
      WHERE legacy_item_category_id = 1001
    `).get() as { count: number }).count,
    0,
  );
  assert.equal(
    (database.prepare(`
      SELECT outcome FROM supplier_taxonomy_legacy_imports
      WHERE legacy_item_category_id = 1001
    `).get() as { outcome: string }).outcome,
    "duplicate",
  );
  database.close();
});

test("a write failure rolls back all earlier imported-item updates", () => {
  const database = createDatabase();
  database.exec(`
    CREATE TRIGGER fail_second_import_update
    BEFORE UPDATE ON supplier_taxonomy_items
    WHEN OLD.id = 2
    BEGIN
      SELECT RAISE(ABORT, 'intentional test failure');
    END;
  `);

  assert.throws(
    () => applyApprovedLegacyItemAssignments(database, "approved-at"),
    /intentional test failure/,
  );
  assert.equal(
    (database.prepare(`
      SELECT COUNT(*) AS count FROM supplier_taxonomy_items
      WHERE id BETWEEN 1 AND 153 AND is_active = 1
    `).get() as { count: number }).count,
    0,
  );
  assert.equal(
    (database.prepare(`
      SELECT COUNT(*) AS count FROM supplier_taxonomy_legacy_item_mappings
      WHERE legacy_item_category_id BETWEEN 1 AND 153
        AND reviewed_at = 'approved-at'
    `).get() as { count: number }).count,
    0,
  );
  database.close();
});