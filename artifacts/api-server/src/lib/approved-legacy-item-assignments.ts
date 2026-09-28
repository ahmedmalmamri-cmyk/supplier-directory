import type { DatabaseSync } from "node:sqlite";

export type ApprovedLegacyItemAssignment = {
  oldItemName: string;
  destinationNodeName: string;
};

const assignmentRows = `
دقيق ابيض|دقيق وسكر
سكر|دقيق وسكر
زبدة ودهون|زيوت ودهون
سمن|زيوت ودهون
حليب ومشتقاته|بيض وألبان
أجبان|بيض وألبان
زبادي وقشطة|بيض وألبان
كريمة|كريمة وتزيين
شوكولاتة وكاكاو|مكسرات وإضافات
جيلاتين بودر|مكسرات وإضافات
عسل ومحليات|دقيق وسكر
خمائر ومحسنات|مواد رافعة ونكهات
نكهات وألوان|مواد رافعة ونكهات
فانيليا ومستخلصات|مواد رافعة ونكهات
عجين سمبوسة|المواد الأولية
عجين بيتزا|المواد الأولية
خبز رقاق|المواد الأولية
مفرزنات - معجنات|مكسرات وإضافات
علب وتغليف|مستلزمات التغليف
أكياس مطبوعة|أكياس التغليف
كراتين مطبوعة|مستلزمات التغليف
أدوات تزيين|كريمة وتزيين
معدات وأفران|معدات المخابز
أدوات صغيرة|معدات المخابز
حشوة توت|حشوات الكيك
حشوة فراولة|حشوات الكيك
حشوة كريمة لوتس|حشوات الكيك
حشوة كريمة فستق|حشوات الكيك
حشوة كريمة نوتيلا|حشوات الكيك
حشوة شوكولاتة|حشوات الكيك
حشوة كراميل|حشوات الكيك
حشوة مانجو|حشوات الكيك
حشوة ليمون|حشوات الكيك
حشوة تفاح|حشوات الكيك
سميد|دقيق وسكر
برغل|دقيق وسكر
نخالة|دقيق وسكر
سكر بودرة|دقيق وسكر
زبدة|زيوت ودهون
سمن نباتي|زيوت ودهون
سمن حيواني|زيوت ودهون
زيت|زيوت ودهون
زيت زيتون|زيوت ودهون
شورتنج|زيوت ودهون
حليب بودرة|بيض وألبان
حليب مكثف|بيض وألبان
حليب طازج|بيض وألبان
كريمة طبخ|بيض وألبان
لبنة|بيض وألبان
زبادي|بيض وألبان
جبن كيري|بيض وألبان
جبن موزاريلا|بيض وألبان
جبن شيدر|بيض وألبان
جبن فيتا|بيض وألبان
جبن حلومي|بيض وألبان
جبن عكاوي|بيض وألبان
جبن رومي|بيض وألبان
جبن سائل|بيض وألبان
شوكولاتة بلوك|مكسرات وإضافات
شوكولاتة بودرة|مكسرات وإضافات
زبدة كاكاو|مكسرات وإضافات
صوص شوكولاتة|مكسرات وإضافات
خليط كيك اسفنجى فانيليا|خلطات الكيك
خليط مافن فانيليا|خلطات الكيك
خليط براوني|خلطات الكيك
خليط دونات|خلطات الكيك
كاستر بودر|مكسرات وإضافات
جيلاتين|مكسرات وإضافات
جيلي|مكسرات وإضافات
نشا|دقيق وسكر
بيكنج بودر|مواد رافعة ونكهات
كريمة لوتس|كريمة وتزيين
كريمة فستق|كريمة وتزيين
كريمة نوتيلا|كريمة وتزيين
توفي كراميل|حشوات الكيك
مربى مشمش|حشوات الكيك
عسل|دقيق وسكر
دبس تمر|مكسرات وإضافات
دبس رمان|مكسرات وإضافات
لوز|مكسرات وإضافات
كاجو|مكسرات وإضافات
فستق|مكسرات وإضافات
بندق|مكسرات وإضافات
جوز|مكسرات وإضافات
بيكان|مكسرات وإضافات
فول سوداني|مكسرات وإضافات
سمسم|مكسرات وإضافات
حبة البركة|مكسرات وإضافات
جوز الهند|مكسرات وإضافات
خميرة|مواد رافعة ونكهات
محسن خبز|مواد رافعة ونكهات
محسن كيك|مواد رافعة ونكهات
بيكنج صودا|مواد رافعة ونكهات
مانع عفن|مواد رافعة ونكهات
فانيليا|مواد رافعة ونكهات
نكهات|مواد رافعة ونكهات
ألوان طعام|مواد رافعة ونكهات
ألوان بودرة|مواد رافعة ونكهات
عطور حلويات|مواد رافعة ونكهات
مستخلصات|مواد رافعة ونكهات
زعفران|مواد رافعة ونكهات
هيل|مواد رافعة ونكهات
قرفة|مواد رافعة ونكهات
كمون|مواد رافعة ونكهات
ينسون|مواد رافعة ونكهات
سماق|مواد رافعة ونكهات
زعتر|مواد رافعة ونكهات
كركم|مواد رافعة ونكهات
ملح ليمون|مواد رافعة ونكهات
بسكويت لوتس|مكسرات وإضافات
بسكويت أوريو|مكسرات وإضافات
بسكويت أصابع|مكسرات وإضافات
بسكويت فنجر|مكسرات وإضافات
كرز أحمر|مكسرات وإضافات
فواكه مشكلة|مكسرات وإضافات
عجين كنافة|المواد الأولية
عجين تمر|المواد الأولية
علب كيك|علب الكيك
علب حلويات|مستلزمات التغليف
علب بسبوسة|مستلزمات التغليف
علب ورق عنب|مستلزمات التغليف
علب لقيمات|مستلزمات التغليف
أكياس كريمة|كريمة وتزيين
أكياس تغليف|أكياس التغليف
كراتين|مستلزمات التغليف
قواعد كيك|قوالب وأدوات تشكيل
ورق زبدة|أوراق التغليف
ورق سكر|كريمة وتزيين
ورق ويفر|كريمة وتزيين
ألمنيوم|أوراق التغليف
سلوفان|أوراق التغليف
رول تغليف|أوراق التغليف
رؤوس تزيين|كريمة وتزيين
ورق ذهب|كريمة وتزيين
لولو كرات|كريمة وتزيين
فرمسلي|كريمة وتزيين
حبر طابعة|كريمة وتزيين
رشات لولو|كريمة وتزيين
ماء ورد|مواد رافعة ونكهات
ماء زهر|مواد رافعة ونكهات
خل|مواد رافعة ونكهات
كاتشب|مكسرات وإضافات
مايونيز|مكسرات وإضافات
صوص بيتزا|مكسرات وإضافات
صوص حار|مكسرات وإضافات
مواد أخرى|مستلزمات الكيك
خليط كيك اسفنجى شكلاتة|خلطات الكيك
قوالب كيك دائرية|قوالب وأدوات تشكيل
قوالب كيك مربعة|قوالب وأدوات تشكيل
قوالب كيك مستطيلة|قوالب وأدوات تشكيل
ورق كيك|أوراق التغليف
دخن|دقيق وسكر
شعير|دقيق وسكر
`.trim();

export const approvedLegacyItemAssignments: readonly ApprovedLegacyItemAssignment[] =
  Object.freeze(assignmentRows.split("\n").map((row) => {
    const separator = row.indexOf("|");
    if (separator < 1 || separator === row.length - 1) {
      throw new Error(`Invalid approved legacy taxonomy assignment: ${row}`);
    }
    return Object.freeze({
      oldItemName: row.slice(0, separator),
      destinationNodeName: row.slice(separator + 1),
    });
  }));

const APPROVED_ASSIGNMENT_NAME_COUNT = 153;
const EXPECTED_IMPORTED_MARKER_COUNT = 152;
const EXPECTED_DUPLICATE_ITEM_COUNT = 128;

type LegacyLeaf = { id: number; name: string };
type ImportMarker = {
  legacyId: number;
  taxonomyItemId: number | null;
  outcome: string;
  createdAt: string;
};
type TaxonomyItem = { id: number; name: string; categoryId: number; active: number };
type TaxonomyNode = { id: number; parentId: number | null; name: string; active: number };

export type ApprovedLegacyAssignmentSummary = {
  sourceItemCount: number;
  importedItemCount: number;
  importedItemsUpdated: number;
  importedItemsAlreadyAssigned: number;
  duplicateItemCount: number;
  duplicateMappingsAdded: number;
  duplicateMappingsAlreadyReviewed: number;
};

function normalizedName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ar");
}

function rowsByName<T extends { name: string }>(rows: T[]): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const key = normalizedName(row.name);
    const matches = result.get(key) ?? [];
    matches.push(row);
    result.set(key, matches);
  }
  return result;
}

function assertUniqueApprovedNames(): void {
  const sourceNames = new Set<string>();
  for (const assignment of approvedLegacyItemAssignments) {
    const sourceName = normalizedName(assignment.oldItemName);
    if (!sourceName || sourceNames.has(sourceName)) {
      throw new Error(`Duplicate or empty approved legacy item name: ${assignment.oldItemName}`);
    }
    sourceNames.add(sourceName);
  }
  if (approvedLegacyItemAssignments.length !== APPROVED_ASSIGNMENT_NAME_COUNT) {
    throw new Error(
      `Expected ${APPROVED_ASSIGNMENT_NAME_COUNT} approved assignments; found ${approvedLegacyItemAssignments.length}`,
    );
  }
}

/**
 * Applies only the owner-approved imported-item assignments and records safe
 * exact-name mappings for duplicate legacy leaves. It leaves every old source
 * row untouched and never copies supplier links for duplicate leaves.
 */
export function applyApprovedLegacyItemAssignments(
  database: DatabaseSync,
  now = new Date().toISOString(),
): ApprovedLegacyAssignmentSummary {
  assertUniqueApprovedNames();
  if (!now.trim()) throw new Error("A non-empty timestamp is required");

  let transactionStarted = false;
  database.exec("BEGIN IMMEDIATE");
  transactionStarted = true;
  try {
    const oldLeaves = database.prepare(`
      SELECT source.id, source.name
      FROM item_categories source
      WHERE NOT EXISTS (
        SELECT 1 FROM item_categories child WHERE child.parent_id = source.id
      )
      ORDER BY source.id
    `).all() as LegacyLeaf[];
    const leafIds = new Set(oldLeaves.map((leaf) => leaf.id));
    const leavesByName = rowsByName(oldLeaves);
    const markers = database.prepare(`
      SELECT legacy_item_category_id AS legacyId,
        taxonomy_item_id AS taxonomyItemId, outcome, created_at AS createdAt
      FROM supplier_taxonomy_legacy_imports
    `).all() as ImportMarker[];
    const markerByLegacyId = new Map(markers.map((marker) => [marker.legacyId, marker]));
    if (markers.length !== oldLeaves.length || markers.some((marker) => !leafIds.has(marker.legacyId))) {
      throw new Error("Every old leaf must have exactly one current import marker before assignments can be applied");
    }

    const importedMarkers = markers.filter((marker) => marker.outcome === "imported");
    const duplicateMarkers = markers.filter(
      (marker) => marker.outcome === "duplicate" || marker.outcome === "already_mapped",
    );
    if (importedMarkers.length !== EXPECTED_IMPORTED_MARKER_COUNT) {
      throw new Error(
        `Expected ${EXPECTED_IMPORTED_MARKER_COUNT} imported markers; found ${importedMarkers.length}`,
      );
    }
    if (duplicateMarkers.length !== EXPECTED_DUPLICATE_ITEM_COUNT) {
      throw new Error(
        `Expected ${EXPECTED_DUPLICATE_ITEM_COUNT} duplicate markers; found ${duplicateMarkers.length}`,
      );
    }
    if (markers.some((marker) => marker.outcome !== "imported" &&
      marker.outcome !== "duplicate" && marker.outcome !== "already_mapped")) {
      throw new Error("An old leaf has an unsupported import marker outcome");
    }

    const taxonomyItems = database.prepare(`
      SELECT id, name, category_id AS categoryId, is_active AS active
      FROM supplier_taxonomy_items
      ORDER BY id
    `).all() as TaxonomyItem[];
    const itemsByName = rowsByName(taxonomyItems);
    const nodes = database.prepare(`
      SELECT id, parent_id AS parentId, name, is_active AS active
      FROM supplier_taxonomy_nodes
    `).all() as TaxonomyNode[];
    const activeNodesByName = rowsByName(nodes.filter((node) => node.active === 1));
    const nodesById = new Map(nodes.map((node) => [node.id, node]));

    const findUniqueLeaf = (name: string): LegacyLeaf => {
      const matches = leavesByName.get(normalizedName(name)) ?? [];
      if (matches.length !== 1) {
        throw new Error(`Expected one current old leaf named "${name}"; found ${matches.length}`);
      }
      return matches[0];
    };
    const findUniqueTaxonomyItem = (name: string): TaxonomyItem => {
      const matches = itemsByName.get(normalizedName(name)) ?? [];
      if (matches.length !== 1) {
        throw new Error(`Expected one exact normalized taxonomy item named "${name}"; found ${matches.length}`);
      }
      return matches[0];
    };
    const findActiveDestination = (name: string): TaxonomyNode => {
      const matches = activeNodesByName.get(normalizedName(name)) ?? [];
      if (matches.length !== 1) {
        throw new Error(`Expected one active destination node named "${name}"; found ${matches.length}`);
      }
      const destination = matches[0];
      let current: TaxonomyNode | undefined = destination;
      const visited = new Set<number>();
      while (current) {
        if (current.active !== 1) {
          throw new Error(`Destination node "${name}" has an inactive ancestor`);
        }
        if (visited.has(current.id)) throw new Error(`Destination node "${name}" has a parent cycle`);
        visited.add(current.id);
        if (current.parentId === null) break;
        const parent = nodesById.get(current.parentId);
        if (!parent) throw new Error(`Destination node "${name}" has a missing parent`);
        current = parent;
      }
      return destination;
    };

    const previousMappings = database.prepare(`
      SELECT taxonomy_item_id AS itemId
      FROM supplier_taxonomy_legacy_item_mappings
      WHERE legacy_item_category_id = ?
    `);
    const importedAssignments = approvedLegacyItemAssignments.flatMap((assignment) => {
      const leaf = findUniqueLeaf(assignment.oldItemName);
      const marker = markerByLegacyId.get(leaf.id);
      if (!marker) {
        throw new Error(`Old item "${assignment.oldItemName}" is not marked as imported`);
      }
      if (normalizedName(leaf.name) !== normalizedName(assignment.oldItemName)) {
        throw new Error(`The old source name changed for "${assignment.oldItemName}"`);
      }
      if (marker.outcome === "already_mapped" && marker.taxonomyItemId !== null) {
        const previous = previousMappings.get(leaf.id) as { itemId: number } | undefined;
        const reviewedItem = taxonomyItems.find((candidate) => candidate.id === marker.taxonomyItemId);
        const canonicalAssignment = reviewedItem
          ? approvedLegacyItemAssignments.find((candidate) =>
            normalizedName(candidate.oldItemName) === normalizedName(reviewedItem.name))
          : undefined;
        if (!previous || previous.itemId !== marker.taxonomyItemId || !reviewedItem ||
          !canonicalAssignment || canonicalAssignment.destinationNodeName !== assignment.destinationNodeName) {
          throw new Error(`The reviewed alias mapping for "${assignment.oldItemName}" is incomplete or inconsistent`);
        }
        return [];
      }
      if (marker.outcome !== "imported" || marker.taxonomyItemId === null) {
        throw new Error(`Old item "${assignment.oldItemName}" is not marked as imported`);
      }
      const item = findUniqueTaxonomyItem(assignment.oldItemName);
      if (item.id !== marker.taxonomyItemId) {
        throw new Error(`The import marker for "${assignment.oldItemName}" points to a different taxonomy item`);
      }
      const destination = findActiveDestination(assignment.destinationNodeName);
      return [{ legacyId: leaf.id, marker, item, destination }];
    });
    if (new Set(importedAssignments.map((entry) => entry.legacyId)).size !== EXPECTED_IMPORTED_MARKER_COUNT) {
      throw new Error("Approved assignments do not cover distinct old source leaves");
    }
    if (importedAssignments.length !== importedMarkers.length) {
      throw new Error("Approved assignments do not cover every imported marker");
    }

    const duplicateAssignments = duplicateMarkers.map((marker) => {
      const leaf = oldLeaves.find((candidate) => candidate.id === marker.legacyId);
      if (!leaf) throw new Error(`Duplicate marker ${marker.legacyId} has no old source leaf`);
      const existingLinks = (database.prepare(`
        SELECT COUNT(*) AS count FROM supplier_categories WHERE item_category_id = ?
      `).get(leaf.id) as { count: number }).count;
      if (existingLinks !== 0) {
        throw new Error(`Duplicate old item "${leaf.name}" has supplier links and cannot be mapped automatically`);
      }
      const priorMapping = database.prepare(`
        SELECT taxonomy_item_id AS itemId
        FROM supplier_taxonomy_legacy_item_mappings
        WHERE legacy_item_category_id = ?
      `).get(leaf.id) as { itemId: number } | undefined;
      // A reviewed duplicate may have been merged into a canonical item whose
      // name differs from the old leaf. Honor that stable ID mapping on later
      // runs instead of requiring the retired duplicate row to exist forever.
      const item = priorMapping
        ? taxonomyItems.find((candidate) => candidate.id === priorMapping.itemId)
        : findUniqueTaxonomyItem(leaf.name);
      if (!item) {
        throw new Error(`The reviewed duplicate mapping for "${leaf.name}" points to a missing taxonomy item`);
      }
      if (marker.taxonomyItemId !== null && marker.taxonomyItemId !== item.id) {
        throw new Error(`The duplicate marker for "${leaf.name}" points to a different taxonomy item`);
      }
      if (priorMapping && priorMapping.itemId !== item.id) {
        throw new Error(`The reviewed duplicate mapping for "${leaf.name}" points to a different taxonomy item`);
      }
      return { legacyId: leaf.id, marker, item, hadMapping: !!priorMapping };
    });

    for (const { legacyId, item, destination } of importedAssignments) {
      const previous = previousMappings.get(legacyId) as { itemId: number } | undefined;
      if (previous && previous.itemId !== item.id) {
        throw new Error(`The reviewed source mapping for "${item.name}" points to a different taxonomy item`);
      }
      if (!nodesById.has(destination.id)) {
        throw new Error(`Approved destination "${destination.name}" no longer exists`);
      }
    }

    const updateItem = database.prepare(`
      UPDATE supplier_taxonomy_items
      SET category_id = ?, is_active = 1, updated_at = ?
      WHERE id = ? AND name = ?
        AND (
          category_id != ? OR is_active != 1 OR NOT EXISTS (
            SELECT 1 FROM items_categories
            WHERE item_id = ? AND category_id = ? AND is_primary = 1
          )
        )
    `);
    const demotePrimaryLinks = database.prepare(`
      UPDATE items_categories SET is_primary = 0
      WHERE item_id = ? AND is_primary = 1 AND category_id != ?
    `);
    const insertPrimaryLink = database.prepare(`
      INSERT INTO items_categories (item_id, category_id, is_primary, created_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(item_id, category_id) DO UPDATE SET is_primary = 1
      WHERE items_categories.is_primary != 1
    `);
    const recordReviewedMapping = database.prepare(`
      INSERT INTO supplier_taxonomy_legacy_item_mappings
        (legacy_item_category_id, taxonomy_item_id, reviewed_at)
      VALUES (?, ?, ?)
      ON CONFLICT(legacy_item_category_id) DO NOTHING
    `);
    const markDuplicateReviewed = database.prepare(`
      UPDATE supplier_taxonomy_legacy_imports
      SET taxonomy_item_id = ?, outcome = 'already_mapped'
      WHERE legacy_item_category_id = ?
        AND (taxonomy_item_id != ? OR outcome != 'already_mapped')
    `);

    let importedItemsUpdated = 0;
    let importedItemsAlreadyAssigned = 0;
    for (const { legacyId, item, destination } of importedAssignments) {
      const assignmentResult = updateItem.run(
        destination.id,
        now,
        item.id,
        item.name,
        destination.id,
        item.id,
        destination.id,
      );
      if (assignmentResult.changes > 1) {
        throw new Error(`Imported taxonomy item "${item.name}" changed during assignment`);
      }
      demotePrimaryLinks.run(item.id, destination.id);
      insertPrimaryLink.run(item.id, destination.id, now);
      recordReviewedMapping.run(legacyId, item.id, now);
      if (assignmentResult.changes === 0) importedItemsAlreadyAssigned++;
      else importedItemsUpdated++;
    }

    let duplicateMappingsAdded = 0;
    let duplicateMappingsAlreadyReviewed = 0;
    for (const { legacyId, marker, item, hadMapping } of duplicateAssignments) {
      if (!hadMapping || marker.outcome !== "already_mapped" || marker.taxonomyItemId !== item.id) {
        duplicateMappingsAdded++;
      } else {
        duplicateMappingsAlreadyReviewed++;
      }
      recordReviewedMapping.run(legacyId, item.id, now);
      markDuplicateReviewed.run(item.id, legacyId, item.id);
    }

    database.exec("COMMIT");
    transactionStarted = false;
    return {
      sourceItemCount: oldLeaves.length,
      importedItemCount: importedAssignments.length,
      importedItemsUpdated,
      importedItemsAlreadyAssigned,
      duplicateItemCount: duplicateAssignments.length,
      duplicateMappingsAdded,
      duplicateMappingsAlreadyReviewed,
    };
  } catch (error) {
    if (transactionStarted) database.exec("ROLLBACK");
    throw error;
  }
}