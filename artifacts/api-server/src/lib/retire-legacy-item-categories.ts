import type { DatabaseSync } from "node:sqlite";

export const legacyItemCategoriesRetirementMarker =
  "legacy-item-categories-retired-v1";

const EXPECTED_OLD_CATEGORY_COUNT = 291;
const EXPECTED_OLD_LEAF_COUNT = 280;
const EXPECTED_IMPORTED_ITEM_COUNT = 153;
const ALLOWED_LEGACY_ALIAS_NAMES = new Set([
  "دقيق وخبز",
  "سكر ومحليات",
  "دهون وزبدة",
  "دقيق",
  "خلطات كيك",
  "اسبونش كيك فانيليا",
  "خلطات جاهزة",
  "خلطات قسم الكيك الجاهزة",
  "حشوات الكيك",
  "مواد أخرى",
  "منتجات الألبان",
  "العجائن والجاهز",
  "معجنات مجمدة",
  "جيلاتين وكاسترد",
  "خلطات براوني",
  "خلطات دونات",
  "خلطات مافن",
]);

const ARCHIVE_TABLES = [
  { source: "item_categories", archive: "legacy_item_categories_archive" },
  { source: "groups", archive: "legacy_groups_archive" },
  { source: "item_category_aliases", archive: "legacy_item_category_aliases_archive" },
  { source: "supplier_categories", archive: "legacy_supplier_categories_archive" },
  { source: "category_tags", archive: "legacy_category_tags_archive" },
] as const;

type RowCount = { count: number };
type MigrationRow = { name: string };
type LegacyAliasRow = { alias: string };
type LegacySupplierLinkRow = { supplierId: number; categoryId: number };
type ForeignKeyRow = { table: string };

export type LegacyItemCategoriesRetirementResult = {
  alreadyRetired: boolean;
  archivedItemCategories: number;
  archivedGroups: number;
  archivedAliases: number;
  archivedSupplierLinks: number;
  archivedCategoryTags: number;
};

function countRows(database: DatabaseSync, table: string): number {
  return (database.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get() as RowCount).count;
}

function tableExists(database: DatabaseSync, table: string): boolean {
  return Boolean(database.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(table));
}

function assertForeignKeyChecksPass(database: DatabaseSync): void {
  const violations = database.prepare("PRAGMA foreign_key_check").all();
  if (violations.length > 0) {
    throw new Error(`Legacy taxonomy retirement found ${violations.length} foreign-key violation(s)`);
  }
}

function assertRequestsUseNewTaxonomy(database: DatabaseSync): void {
  if (!tableExists(database, "requests")) {
    throw new Error("Cannot retire legacy categories before the requests table exists");
  }
  const categoryForeignKeys = (database.prepare("PRAGMA foreign_key_list(requests)").all() as Array<{
    from: string;
    table: string;
  }>).filter((foreignKey) => foreignKey.from === "category_id");
  if (categoryForeignKeys.length !== 1 || categoryForeignKeys[0].table !== "supplier_taxonomy_items") {
    throw new Error("Cannot retire legacy categories until requests.category_id references supplier_taxonomy_items");
  }
  const inactiveRequests = database.prepare(`
    SELECT COUNT(*) AS count
    FROM requests request
    JOIN supplier_taxonomy_items item ON item.id = request.category_id
    WHERE item.is_active != 1
  `).get() as RowCount;
  if (inactiveRequests.count > 0) {
    throw new Error(`Cannot retire legacy categories while ${inactiveRequests.count} requests reference inactive items`);
  }
}

function assertOnlyExpectedLegacyReferencesRemain(database: DatabaseSync): void {
  const expectedTargets = new Map<string, Set<string>>([
    ["item_categories", new Set([
      "item_categories",
      "supplier_categories",
      "item_category_aliases",
      "category_tags",
    ])],
    ["groups", new Set(["groups", "item_categories", "category_tags"])],
  ]);
  const tables = database.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).all() as Array<{ name: string }>;
  for (const { name } of tables) {
    const foreignKeys = database.prepare(`PRAGMA foreign_key_list("${name}")`).all() as ForeignKeyRow[];
    for (const foreignKey of foreignKeys) {
      const allowedTables = expectedTargets.get(foreignKey.table);
      if (allowedTables && !allowedTables.has(name)) {
        throw new Error(
          `Cannot retire legacy categories while ${name} still references ${foreignKey.table}`,
        );
      }
    }
  }
}

function assertReviewedLeaves(database: DatabaseSync): void {
  const categoryCount = countRows(database, "item_categories");
  if (categoryCount !== EXPECTED_OLD_CATEGORY_COUNT) {
    throw new Error(`Expected ${EXPECTED_OLD_CATEGORY_COUNT} old categories; found ${categoryCount}`);
  }
  const leafCount = (database.prepare(`
    SELECT COUNT(*) AS count FROM item_categories category
    WHERE NOT EXISTS (
      SELECT 1 FROM item_categories child WHERE child.parent_id = category.id
    )
  `).get() as RowCount).count;
  if (leafCount !== EXPECTED_OLD_LEAF_COUNT) {
    throw new Error(`Expected ${EXPECTED_OLD_LEAF_COUNT} old category leaves; found ${leafCount}`);
  }
  const unmapped = (database.prepare(`
    SELECT COUNT(*) AS count
    FROM item_categories category
    WHERE NOT EXISTS (
      SELECT 1 FROM item_categories child WHERE child.parent_id = category.id
    )
      AND NOT EXISTS (
        SELECT 1
        FROM supplier_taxonomy_legacy_item_mappings mapping
        JOIN supplier_taxonomy_items item
          ON item.id = mapping.taxonomy_item_id AND item.is_active = 1
        JOIN supplier_taxonomy_legacy_imports imported
          ON imported.legacy_item_category_id = mapping.legacy_item_category_id
         AND imported.taxonomy_item_id = mapping.taxonomy_item_id
         AND imported.outcome IN ('imported', 'already_mapped')
        WHERE mapping.legacy_item_category_id = category.id
      )
  `).get() as RowCount).count;
  if (unmapped > 0) {
    throw new Error(`Cannot retire legacy categories while ${unmapped} old leaves lack reviewed active mappings`);
  }
  const importedCount = (database.prepare(`
    SELECT COUNT(*) AS count
    FROM supplier_taxonomy_legacy_imports imported
    JOIN supplier_taxonomy_items item ON item.id = imported.taxonomy_item_id
    WHERE imported.outcome = 'imported' AND item.is_active = 1
  `).get() as RowCount).count;
  if (importedCount !== EXPECTED_IMPORTED_ITEM_COUNT) {
    throw new Error(`Expected ${EXPECTED_IMPORTED_ITEM_COUNT} active imported items; found ${importedCount}`);
  }
}

function assertSupplierLinksCopied(database: DatabaseSync): void {
  const uncopied = database.prepare(`
    SELECT links.supplier_id AS supplierId, links.item_category_id AS categoryId
    FROM supplier_categories links
    LEFT JOIN supplier_taxonomy_legacy_item_mappings mapping
      ON mapping.legacy_item_category_id = links.item_category_id
    LEFT JOIN supplier_taxonomy_item_suppliers taxonomyLinks
      ON taxonomyLinks.supplier_id = links.supplier_id
     AND taxonomyLinks.item_id = mapping.taxonomy_item_id
    WHERE mapping.taxonomy_item_id IS NULL OR taxonomyLinks.item_id IS NULL
    LIMIT 10
  `).all() as LegacySupplierLinkRow[];
  if (uncopied.length > 0) {
    const details = uncopied.map((link) => `${link.supplierId}:${link.categoryId}`).join(", ");
    throw new Error(`Cannot retire legacy categories until supplier links are copied: ${details}`);
  }
}

function assertAliasesSupported(database: DatabaseSync): void {
  const aliases = database.prepare(
    "SELECT DISTINCT alias FROM item_category_aliases ORDER BY alias",
  ).all() as LegacyAliasRow[];
  const unsupported = aliases.filter((row) => !ALLOWED_LEGACY_ALIAS_NAMES.has(row.alias));
  if (unsupported.length > 0) {
    throw new Error(
      `Cannot retire legacy categories: the new resolver does not cover aliases ${unsupported.map((row) => row.alias).join(", ")}`,
    );
  }
}

function createArchiveTables(database: DatabaseSync, now: string): void {
  for (const { source, archive } of ARCHIVE_TABLES) {
    if (!tableExists(database, source)) {
      throw new Error(`Cannot archive legacy taxonomy table ${source}: table is missing`);
    }
    if (tableExists(database, archive)) {
      throw new Error(`Cannot archive legacy taxonomy table ${source}: ${archive} already exists`);
    }
    database.exec(`
      CREATE TABLE "${archive}" AS
      SELECT source.*, CAST(NULL AS TEXT) AS archived_at
      FROM "${source}" source
      WHERE 0
    `);
    database.prepare(`
      INSERT INTO "${archive}"
      SELECT source.*, ? AS archived_at FROM "${source}" source
    `).run(now);
  }
}

function archiveCounts(database: DatabaseSync): LegacyItemCategoriesRetirementResult {
  return {
    alreadyRetired: false,
    archivedItemCategories: countRows(database, "legacy_item_categories_archive"),
    archivedGroups: countRows(database, "legacy_groups_archive"),
    archivedAliases: countRows(database, "legacy_item_category_aliases_archive"),
    archivedSupplierLinks: countRows(database, "legacy_supplier_categories_archive"),
    archivedCategoryTags: countRows(database, "legacy_category_tags_archive"),
  };
}

function assertRetiredState(database: DatabaseSync): LegacyItemCategoriesRetirementResult {
  const remaining = ARCHIVE_TABLES.map(({ source }) => ({ source, count: countRows(database, source) }))
    .filter(({ count }) => count > 0);
  if (remaining.length > 0) {
    throw new Error(`Legacy retirement marker exists but source rows remain: ${remaining.map(({ source }) => source).join(", ")}`);
  }
  for (const { archive } of ARCHIVE_TABLES) {
    if (!tableExists(database, archive)) {
      throw new Error(`Legacy retirement marker exists but archive ${archive} is missing`);
    }
  }
  assertForeignKeyChecksPass(database);
  return { ...archiveCounts(database), alreadyRetired: true };
}

export function isLegacyItemCategoriesRetired(database: DatabaseSync): boolean {
  if (!tableExists(database, "directory_migrations")) return false;
  return Boolean(database.prepare(
    "SELECT 1 FROM directory_migrations WHERE name = ?",
  ).get(legacyItemCategoriesRetirementMarker));
}

/**
 * Explicitly retires the old classification data only after the requests FK,
 * reviewed item mappings, supplier links, and resolver-supported aliases have
 * all passed preflight. Every source table is archived in the same transaction
 * before deletion so a failed check leaves both live rows and archives intact.
 */
export function retireLegacyItemCategories(
  database: DatabaseSync,
  now = new Date().toISOString(),
): LegacyItemCategoriesRetirementResult {
  if (!now.trim()) throw new Error("A non-empty archival timestamp is required");
  if ((database.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys !== 1) {
    throw new Error("Legacy taxonomy retirement requires foreign-key enforcement");
  }

  database.exec("BEGIN IMMEDIATE");
  let transactionStarted = true;
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS directory_migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `);
    if (isLegacyItemCategoriesRetired(database)) {
      const result = assertRetiredState(database);
      database.exec("COMMIT");
      transactionStarted = false;
      return result;
    }

    assertForeignKeyChecksPass(database);
    assertRequestsUseNewTaxonomy(database);
    assertOnlyExpectedLegacyReferencesRemain(database);
    assertReviewedLeaves(database);
    assertSupplierLinksCopied(database);
    assertAliasesSupported(database);

    const oldCounts = Object.fromEntries(
      ARCHIVE_TABLES.map(({ source }) => [source, countRows(database, source)]),
    );
    createArchiveTables(database, now);
    for (const { source } of ARCHIVE_TABLES) {
      const archivedTable = ARCHIVE_TABLES.find((table) => table.source === source)!.archive;
      if (countRows(database, archivedTable) !== oldCounts[source]) {
        throw new Error(`Archival verification failed for ${source}`);
      }
    }

    database.exec(`
      DELETE FROM category_tags;
      DELETE FROM supplier_categories;
      DELETE FROM item_category_aliases;
      DELETE FROM item_categories;
      DELETE FROM groups;
    `);
    assertForeignKeyChecksPass(database);
    for (const { source } of ARCHIVE_TABLES) {
      if (countRows(database, source) !== 0) {
        throw new Error(`Legacy source table ${source} was not fully retired`);
      }
    }
    database.prepare(
      "INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)",
    ).run(legacyItemCategoriesRetirementMarker, now);
    database.exec("COMMIT");
    transactionStarted = false;
    return archiveCounts(database);
  } catch (error) {
    if (transactionStarted) database.exec("ROLLBACK");
    throw error;
  }
}