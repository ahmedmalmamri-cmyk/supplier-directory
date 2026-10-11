import type { DatabaseSync } from "node:sqlite";

export const TEMPORARY_CATEGORY_NAME = "أصناف غير مصنفة";

type LegacyItem = { id: number; name: string };
type ImportMarker = { outcome: "imported" | "duplicate" | "already_mapped"; taxonomyItemId: number | null };

export type LegacyImportSummary = {
  sourceItemCount: number;
  duplicateCount: number;
  readyToImportCount: number;
  importedCount: number;
  alreadyMappedCount: number;
  unreviewedItemCount: number;
  unreviewedSupplierLinkCount: number;
  missingImportedCount: number;
  temporaryCategoryId: number | null;
};

function oldItems(database: DatabaseSync): LegacyItem[] {
  // The old table contains both group headings and items. Only leaf records
  // represent items; this also includes standalone root-level items.
  return database.prepare(`
    SELECT c.id, c.name FROM item_categories c
    WHERE NOT EXISTS (SELECT 1 FROM item_categories child WHERE child.parent_id = c.id)
    ORDER BY c.id
  `).all() as LegacyItem[];
}

function markerFor(database: DatabaseSync, legacyId: number): ImportMarker | undefined {
  return database.prepare(`
    SELECT outcome, taxonomy_item_id AS taxonomyItemId
    FROM supplier_taxonomy_legacy_imports WHERE legacy_item_category_id = ?
  `).get(legacyId) as ImportMarker | undefined;
}

function mappedItem(database: DatabaseSync, legacyId: number): number | undefined {
  return (database.prepare(`
    SELECT taxonomy_item_id AS itemId FROM supplier_taxonomy_legacy_item_mappings
    WHERE legacy_item_category_id = ?
  `).get(legacyId) as { itemId: number } | undefined)?.itemId;
}

function matchingItem(database: DatabaseSync, name: string): number | undefined {
  return (database.prepare(`
    SELECT id FROM supplier_taxonomy_items
    WHERE LOWER(TRIM(name)) = LOWER(?) ORDER BY id LIMIT 1
  `).get(name.trim()) as { id: number } | undefined)?.id;
}

function temporaryCategory(database: DatabaseSync): number | null {
  return (database.prepare(`
    SELECT id FROM supplier_taxonomy_nodes
    WHERE name = ? AND parent_id IS NULL ORDER BY id LIMIT 1
  `).get(TEMPORARY_CATEGORY_NAME) as { id: number } | undefined)?.id ?? null;
}

export function previewLegacyTaxonomyImport(database: DatabaseSync): LegacyImportSummary {
  const rows = oldItems(database);
  let duplicateCount = 0;
  let readyToImportCount = 0;
  let importedCount = 0;
  let alreadyMappedCount = 0;
  let unreviewedItemCount = 0;
  let unreviewedSupplierLinkCount = 0;
  let missingImportedCount = 0;
  const supplierLinks = database.prepare(
    "SELECT COUNT(*) AS count FROM supplier_categories WHERE item_category_id = ?",
  );

  for (const row of rows) {
    const marker = markerFor(database, row.id);
    const mapped = mappedItem(database, row.id);
    if (!mapped) {
      unreviewedItemCount++;
      unreviewedSupplierLinkCount += (supplierLinks.get(row.id) as { count: number }).count;
    }
    if (marker?.outcome === "imported") {
      importedCount++;
      if (marker.taxonomyItemId === null) missingImportedCount++;
    } else if (marker?.outcome === "duplicate") duplicateCount++;
    else if (marker?.outcome === "already_mapped" || mapped) alreadyMappedCount++;
    else if (matchingItem(database, row.name)) duplicateCount++;
    else readyToImportCount++;
  }

  return {
    sourceItemCount: rows.length,
    duplicateCount,
    readyToImportCount,
    importedCount,
    alreadyMappedCount,
    unreviewedItemCount,
    unreviewedSupplierLinkCount,
    missingImportedCount,
    temporaryCategoryId: temporaryCategory(database),
  };
}

export function importLegacyTaxonomyItems(database: DatabaseSync, now: string): {
  added: number;
  skippedDuplicates: number;
  alreadyMapped: number;
  summary: LegacyImportSummary;
} {
  let added = 0;
  let skippedDuplicates = 0;
  let alreadyMapped = 0;
  database.exec("BEGIN IMMEDIATE");
  try {
    const insertMarker = database.prepare(`
      INSERT INTO supplier_taxonomy_legacy_imports
        (legacy_item_category_id, taxonomy_item_id, outcome, created_at)
      VALUES (?, ?, ?, ?)
    `);
    let categoryId = temporaryCategory(database);
    for (const legacy of oldItems(database)) {
      if (markerFor(database, legacy.id)) continue;
      const mapped = mappedItem(database, legacy.id);
      if (mapped) {
        insertMarker.run(legacy.id, mapped, "already_mapped", now);
        alreadyMapped++;
        continue;
      }
      const name = legacy.name.trim();
      if (!name) throw new Error(`Legacy item ${legacy.id} has no name`);
      const duplicateId = matchingItem(database, name);
      if (duplicateId) {
        // Do not move the item or its supplier links. The old record remains
        // available for explicit supplier-link review before any cutover.
        insertMarker.run(legacy.id, duplicateId, "duplicate", now);
        skippedDuplicates++;
        continue;
      }
      if (categoryId === null) {
        const order = (database.prepare(`
          SELECT COALESCE(MAX(display_order), 0) AS value
          FROM supplier_taxonomy_nodes WHERE parent_id IS NULL
        `).get() as { value: number }).value;
        categoryId = Number(database.prepare(`
          INSERT INTO supplier_taxonomy_nodes
            (parent_id, name, icon, description, display_order, is_active, created_at, updated_at)
          VALUES (NULL, ?, '📥', ?, ?, 0, ?, ?)
        `).run(TEMPORARY_CATEGORY_NAME, "أصناف من التصنيف القديم بانتظار مراجعة أقسامها", order + 1, now, now).lastInsertRowid);
      }
      const itemId = Number(database.prepare(`
        INSERT INTO supplier_taxonomy_items
          (name, category_id, is_active, notes, created_at, updated_at)
        VALUES (?, ?, 0, ?, ?, ?)
      `).run(name, categoryId, "مستورد من التصنيف القديم؛ راجع القسم قبل التفعيل", now, now).lastInsertRowid);
      database.prepare(`
        INSERT INTO items_categories (item_id, category_id, is_primary, created_at)
        VALUES (?, ?, 1, ?)
      `).run(itemId, categoryId, now);
      database.prepare(`
        INSERT OR IGNORE INTO supplier_taxonomy_item_suppliers (supplier_id, item_id, created_at)
        SELECT supplier_id, ?, ? FROM supplier_categories WHERE item_category_id = ?
      `).run(itemId, now, legacy.id);
      database.prepare(`
        INSERT INTO supplier_taxonomy_legacy_item_mappings
          (legacy_item_category_id, taxonomy_item_id, reviewed_at)
        VALUES (?, ?, ?)
      `).run(legacy.id, itemId, now);
      insertMarker.run(legacy.id, itemId, "imported", now);
      added++;
    }
    const summary = previewLegacyTaxonomyImport(database);
    database.exec("COMMIT");
    return { added, skippedDuplicates, alreadyMapped, summary };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}