import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";

const canonicalRoots = [
  ["المواد الأساسية", "basic-materials", "🌾"],
  ["منتجات الألبان", "dairy", "🥛"],
  ["الأجبان", "cheese", "🧀"],
  ["الشوكولاتة والكاكاو", "chocolate", "🍫"],
  ["المكسرات والبذور", "nuts", "🥜"],
  ["خلطات جاهزة", "cake-mixes", "🍰"],
  ["الخمائر والمحسنات", "yeast", "🧪"],
  ["النكهات والألوان", "flavors", "🌿"],
  ["العجائن والجاهز", "dough", "🥟"],
  ["التغليف والعلب", "packaging", "📦"],
  ["المعدات والأدوات", "equipment", "⚙️"],
  ["حشوات الكيك", "cake-fillings", "🍰"],
  ["مواد أخرى", "others", "🧴"],
] as const;

const priorMigrationNames = [
  "add-sugar-paste-google-info",
  "classify-existing-supplier-sources",
  "cake-fillings-item-categories",
  "grouped-item-category-catalog-v1",
  "grouped-item-category-catalog-v2",
  "grouped-item-category-catalog-v3",
  "three-level-item-category-taxonomy-v1",
  "stable-item-category-alias-ids-v1",
  "normalized-supplier-item-categories-v1",
  "clear-seeded-suppliers",
  "correct-supplier-names",
  "restore-supplier-rating-fallbacks",
];

function createPreMigrationDatabase(databasePath: string) {
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE directory_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE item_categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL,
      group_name TEXT NOT NULL,
      parent_id INTEGER REFERENCES item_categories(id),
      slug TEXT,
      description TEXT,
      display_on_home INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE supplier_categories (
      supplier_id INTEGER NOT NULL,
      item_category_id INTEGER NOT NULL,
      PRIMARY KEY (supplier_id, item_category_id)
    );
  `);
  const now = new Date().toISOString();
  const insertRoot = database.prepare(`
    INSERT INTO item_categories
      (id, name, icon, group_name, parent_id, slug, display_on_home,
       display_order, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, ?, 1, ?, 1, ?, ?)
  `);
  canonicalRoots.forEach(([name, slug, icon], index) => {
    const id = slug === "cake-mixes" ? 14 : 1001 + index;
    insertRoot.run(id, name, icon, name, slug, index + 1, now, now);
  });
  database.prepare(`
    INSERT INTO item_categories
      (id, name, icon, group_name, parent_id, slug, display_order,
       is_active, created_at, updated_at)
    VALUES (2001, 'Test primary leaf', '🌾', ?, 1001,
      'test-primary-leaf', 1, 1, ?, ?)
  `).run(canonicalRoots[0][0], now, now);
  database.prepare(`
    INSERT INTO supplier_categories (supplier_id, item_category_id)
    VALUES (1, 2001)
  `).run();
  const insertMigration = database.prepare(`
    INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)
  `);
  for (const name of priorMigrationNames) insertMigration.run(name, now);
  database.close();
}

test("group taxonomy migration mirrors roots and preserves supplier mappings", async () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "bakery-groups-migration-"));
  const dataDirectory = path.join(temporaryDirectory, "data");
  const testDatabasePath = path.join(dataDirectory, "bakery-directory.sqlite");
  mkdirSync(dataDirectory, { recursive: true });
  const sourceDatabase = process.env.CATEGORY_GROUPS_PRE_MIGRATION_DB;
  if (sourceDatabase) copyFileSync(sourceDatabase, testDatabasePath);
  else createPreMigrationDatabase(testDatabasePath);

  const before = new DatabaseSync(testDatabasePath);
  const existingMigration = before.prepare(`
    SELECT name FROM directory_migrations
    WHERE name = 'group-tag-primary-category-taxonomy-v1'
  `).get();
  assert.equal(existingMigration, undefined);
  const previousRoots = before.prepare(`
    SELECT id, name, slug FROM item_categories
    WHERE parent_id IS NULL AND is_active = 1
      AND slug IN (${canonicalRoots.map(() => "?").join(", ")})
    ORDER BY id
  `).all(...canonicalRoots.map((root) => root[1]));
  const legacyParent = before.prepare(`
    SELECT id, parent_id AS parentId, group_name AS groupName
    FROM item_categories
    WHERE parent_id IS NOT NULL
    ORDER BY id LIMIT 1
  `).get() as { id: number; parentId: number; groupName: string };
  const legacyGrandchildId = Number(before.prepare(`
    INSERT INTO item_categories
      (name, icon, group_name, parent_id, slug, display_on_home,
       display_order, is_active, created_at, updated_at)
    VALUES ('__test_inactive_legacy_grandchild__', '🧪', ?, ?,
      'test-inactive-legacy-grandchild', 0, 999, 0, ?, ?)
  `).run(legacyParent.groupName, legacyParent.id, new Date().toISOString(), new Date().toISOString()).lastInsertRowid);
  const supplierMappingsBefore = before.prepare(`
    SELECT supplier_id AS supplierId, item_category_id AS itemCategoryId
    FROM supplier_categories ORDER BY supplier_id, item_category_id
  `).all();
  before.close();

  const previousDirectory = process.cwd();
  try {
    process.chdir(temporaryDirectory);
    const migrationEntry = path.join(temporaryDirectory, "directory-db.mjs");
    await build({
      entryPoints: [path.join(path.dirname(fileURLToPath(import.meta.url)), "directory-db.ts")],
      bundle: true,
      platform: "node",
      format: "esm",
      outfile: migrationEntry,
    });
    const { directoryDb } = await import(pathToFileURL(migrationEntry).href);
    const groups = directoryDb.prepare(`
      SELECT id, name, slug FROM groups ORDER BY id
    `).all();
    const mirroredRoots = directoryDb.prepare(`
      SELECT g.id, g.name, g.slug
      FROM groups g
      JOIN item_categories c ON c.id = g.id
      WHERE c.parent_id IS NULL
      ORDER BY g.id
    `).all();
    const backfillMismatch = directoryDb.prepare(`
      SELECT COUNT(*) AS count FROM item_categories
      WHERE parent_id IS NOT NULL AND primary_group_id != parent_id
    `).get() as { count: number };
    const orphanedPrimaryGroups = directoryDb.prepare(`
      SELECT COUNT(*) AS count
      FROM item_categories c
      WHERE c.primary_group_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM groups g WHERE g.id = c.primary_group_id)
    `).get() as { count: number };
    const foreignKeyViolations = directoryDb.prepare("PRAGMA foreign_key_check").all();
    const flattenedGrandchild = directoryDb.prepare(`
      SELECT parent_id AS parentId, primary_group_id AS primaryGroupId, is_active AS isActive
      FROM item_categories WHERE id = ?
    `).get(legacyGrandchildId) as {
      parentId: number;
      primaryGroupId: number;
      isActive: number;
    };
    const supplierMappingsAfter = directoryDb.prepare(`
      SELECT supplier_id AS supplierId, item_category_id AS itemCategoryId
      FROM supplier_categories ORDER BY supplier_id, item_category_id
    `).all();

    assert.equal(groups.length, 13);
    assert.deepEqual(groups, previousRoots);
    assert.deepEqual(mirroredRoots, previousRoots);
    assert.equal(backfillMismatch.count, 0);
    assert.equal(orphanedPrimaryGroups.count, 0);
    assert.equal(foreignKeyViolations.length, 0);
    assert.equal(flattenedGrandchild.parentId, legacyParent.parentId);
    assert.equal(flattenedGrandchild.primaryGroupId, legacyParent.parentId);
    assert.equal(flattenedGrandchild.isActive, 0);
    assert.deepEqual(supplierMappingsAfter, supplierMappingsBefore);
    assert.ok(directoryDb.prepare(`
      SELECT name FROM directory_migrations
      WHERE name = 'group-tag-primary-category-taxonomy-v1'
    `).get());
    directoryDb.close();

    const secondStartup = spawnSync(
      process.execPath,
      ["-e", `await import(${JSON.stringify(pathToFileURL(migrationEntry).href)})`],
      { cwd: temporaryDirectory, encoding: "utf8" },
    );
    assert.equal(secondStartup.status, 0, secondStartup.stderr);
    const afterSecondStartup = new DatabaseSync(testDatabasePath);
    const groupCount = afterSecondStartup.prepare(
      "SELECT COUNT(*) AS count FROM groups",
    ).get() as { count: number };
    assert.equal(groupCount.count, 13);
    const grandchildAfterSecondStartup = afterSecondStartup.prepare(`
      SELECT parent_id AS parentId, primary_group_id AS primaryGroupId, is_active AS isActive
      FROM item_categories WHERE id = ?
    `).get(legacyGrandchildId) as {
      parentId: number;
      primaryGroupId: number;
      isActive: number;
    };
    assert.equal(grandchildAfterSecondStartup.parentId, legacyParent.parentId);
    assert.equal(grandchildAfterSecondStartup.primaryGroupId, legacyParent.parentId);
    assert.equal(grandchildAfterSecondStartup.isActive, 0);
    assert.deepEqual(
      afterSecondStartup.prepare(`
        SELECT supplier_id AS supplierId, item_category_id AS itemCategoryId
        FROM supplier_categories ORDER BY supplier_id, item_category_id
      `).all(),
      supplierMappingsBefore,
    );

    const primaryGroup = afterSecondStartup.prepare(`
      SELECT id, name FROM groups WHERE is_active = 1 ORDER BY id LIMIT 1
    `).get() as { id: number; name: string };
    const secondaryGroup = afterSecondStartup.prepare(`
      SELECT id FROM groups
      WHERE is_active = 1 AND id != ?
      ORDER BY id LIMIT 1
    `).get(primaryGroup.id) as { id: number };
    const nextId = (afterSecondStartup.prepare(`
      SELECT MAX(id) + 1 AS id
      FROM (
        SELECT id FROM groups
        UNION ALL
        SELECT id FROM item_categories
      )
    `).get() as { id: number }).id;
    const now = new Date().toISOString();
    afterSecondStartup.prepare(`
      INSERT INTO groups (id, name, slug, icon, display_order, is_active)
      VALUES (?, 'Migration test group', 'migration-test-group', '🧪', 999, 1)
    `).run(nextId);
    afterSecondStartup.prepare(`
      INSERT INTO item_categories
        (id, name, icon, group_name, parent_id, slug, display_on_home,
         display_order, is_active, created_at, updated_at, primary_group_id)
      VALUES (?, 'Migration test group', '🧪', 'Migration test group', NULL,
        'migration-test-group', 1, 999, 1, ?, ?, NULL)
    `).run(nextId, now, now);
    afterSecondStartup.prepare(`
      INSERT INTO item_categories
        (id, name, icon, group_name, parent_id, slug, display_order,
         is_active, created_at, updated_at, primary_group_id)
      VALUES (?, 'Migration test category', '🧪', ?, ?, 'migration-test-category',
        1, 1, ?, ?, ?)
    `).run(nextId + 1, primaryGroup.name, primaryGroup.id, now, now, primaryGroup.id);
    const insertTag = afterSecondStartup.prepare(`
      INSERT INTO category_tags (category_id, group_id, created_at) VALUES (?, ?, ?)
    `);
    insertTag.run(nextId + 1, nextId, now);
    assert.throws(() => insertTag.run(nextId + 1, nextId, now), /UNIQUE constraint failed/);
    afterSecondStartup.prepare("DELETE FROM item_categories WHERE id = ?").run(nextId);
    afterSecondStartup.prepare("DELETE FROM groups WHERE id = ?").run(nextId);
    const groupCascadeCount = (afterSecondStartup.prepare(`
      SELECT COUNT(*) AS count FROM category_tags WHERE category_id = ? AND group_id = ?
    `).get(nextId + 1, nextId) as { count: number }).count;
    assert.equal(groupCascadeCount, 0);

    insertTag.run(nextId + 1, secondaryGroup.id, now);
    afterSecondStartup.prepare("DELETE FROM item_categories WHERE id = ?").run(nextId + 1);
    const categoryCascadeCount = (afterSecondStartup.prepare(`
      SELECT COUNT(*) AS count FROM category_tags WHERE category_id = ?
    `).get(nextId + 1) as { count: number }).count;
    assert.equal(categoryCascadeCount, 0);
    afterSecondStartup.close();

    const categoryGroupsSourceDirectory = path.dirname(fileURLToPath(import.meta.url));
    const groupDeleteEntry = path.join(temporaryDirectory, "group-delete.mjs");
    await build({
      stdin: {
        contents: `
          export { deleteEmptyGroup } from "./item-category-groups.ts";
          export { directoryDb } from "./directory-db.ts";
        `,
        resolveDir: categoryGroupsSourceDirectory,
        sourcefile: "group-delete-test-entry.ts",
      },
      bundle: true,
      platform: "node",
      format: "esm",
      outfile: groupDeleteEntry,
    });
    const { deleteEmptyGroup, directoryDb: groupDeleteDb } = await import(pathToFileURL(groupDeleteEntry).href);
    const idBase = (groupDeleteDb.prepare(`
      SELECT MAX(id) + 1 AS id FROM (
        SELECT id FROM groups
        UNION ALL SELECT id FROM item_categories
        UNION ALL SELECT id FROM categories
      )
    `).get() as { id: number }).id;
    const insertGroup = groupDeleteDb.prepare(`
      INSERT INTO groups (id, name, slug, icon, display_order, is_active)
      VALUES (?, ?, ?, '🧪', 999, 1)
    `);
    const insertRoot = groupDeleteDb.prepare(`
      INSERT INTO item_categories
        (id, name, icon, group_name, parent_id, slug, display_on_home,
         display_order, is_active, created_at, updated_at, primary_group_id)
      VALUES (?, ?, '🧪', ?, NULL, ?, 1, 999, 1, ?, ?, NULL)
    `);
    const deleteNow = new Date().toISOString();
    insertGroup.run(idBase, "Empty delete test group", "empty-delete-test-group");
    insertRoot.run(
      idBase,
      "Empty delete test group",
      "Empty delete test group",
      "empty-delete-test-group",
      deleteNow,
      deleteNow,
    );
    insertGroup.run(idBase + 1, "Linked delete test group", "linked-delete-test-group");
    insertRoot.run(
      idBase + 1,
      "Linked delete test group",
      "Linked delete test group",
      "linked-delete-test-group",
      deleteNow,
      deleteNow,
    );
    const supplierId = (groupDeleteDb.prepare(`
      SELECT COALESCE(MAX(id), 0) + 1 AS id FROM suppliers
    `).get() as { id: number }).id;
    groupDeleteDb.prepare(`
      INSERT INTO suppliers
        (id, name, city, region, description, phone, whatsapp, created_at)
      VALUES (?, 'Delete safety test supplier', 'الدمام', 'المنطقة الشرقية',
        '', '', '', ?)
    `).run(supplierId, deleteNow);
    groupDeleteDb.prepare(`
      INSERT INTO supplier_categories (supplier_id, item_category_id) VALUES (?, ?)
    `).run(supplierId, idBase + 1);
    groupDeleteDb.prepare(`
      INSERT INTO categories (id, name, icon, slug)
      VALUES (?, 'Delete safety test product category', '🧪', 'delete-safety-test-category')
    `).run(idBase + 1);
    const productId = (groupDeleteDb.prepare(`
      SELECT COALESCE(MAX(id), 0) + 1 AS id FROM products
    `).get() as { id: number }).id;
    groupDeleteDb.prepare(`
      INSERT INTO products
        (id, supplier_id, category_id, name, weight, unit, country_of_origin,
         ingredients, technical_data, recommended_use, shelf_life,
         storage_conditions, min_order, created_at)
      VALUES (?, ?, ?, 'Delete safety test product', '1', 'kg', 'SA',
        '', '', '', '', '', 1, ?)
    `).run(productId, supplierId, idBase + 1, deleteNow);
    groupDeleteDb.prepare(`
      INSERT INTO item_category_aliases (alias, item_category_id)
      VALUES ('Linked delete group alias', ?)
    `).run(idBase + 1);
    groupDeleteDb.prepare(`
      INSERT OR IGNORE INTO admin_credentials (id, password_hash, updated_at)
      VALUES (1, 'test-only-hash', ?)
    `).run(deleteNow);

    assert.deepEqual(deleteEmptyGroup(idBase), { status: "deleted" });
    assert.deepEqual(deleteEmptyGroup(idBase + 1), {
      status: "has-linked-data",
      supplierCategoryCount: 1,
      productCount: 1,
      aliasCount: 1,
    });
    const deletedGroupAudit = groupDeleteDb.prepare(`
      SELECT action_type AS actionType, entity_id AS entityId
      FROM activity_log WHERE entity_id = ? AND action_type = 'delete'
    `).get(idBase);
    assert.ok(deletedGroupAudit);
    groupDeleteDb.close();

    const deletionVerificationDb = new DatabaseSync(testDatabasePath);
    assert.equal(deletionVerificationDb.prepare(
      "SELECT id FROM groups WHERE id = ?",
    ).get(idBase), undefined);
    assert.equal(deletionVerificationDb.prepare(
      "SELECT id FROM item_categories WHERE id = ?",
    ).get(idBase), undefined);
    assert.ok(deletionVerificationDb.prepare(
      "SELECT id FROM groups WHERE id = ?",
    ).get(idBase + 1));
    assert.ok(deletionVerificationDb.prepare(
      "SELECT id FROM item_categories WHERE id = ?",
    ).get(idBase + 1));
    assert.ok(deletionVerificationDb.prepare(
      "SELECT supplier_id FROM supplier_categories WHERE item_category_id = ?",
    ).get(idBase + 1));
    assert.ok(deletionVerificationDb.prepare(
      "SELECT id FROM products WHERE category_id = ?",
    ).get(idBase + 1));
    assert.ok(deletionVerificationDb.prepare(
      "SELECT alias FROM item_category_aliases WHERE item_category_id = ?",
    ).get(idBase + 1));
    deletionVerificationDb.close();
  } finally {
    process.chdir(previousDirectory);
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});