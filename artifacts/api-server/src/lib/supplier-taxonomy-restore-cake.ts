import type { DatabaseSync } from "node:sqlite";
import { approvedLegacyItemAssignments } from "./approved-legacy-item-assignments";
import { suppliedTaxonomyItems } from "./supplier-taxonomy-seed-items";

const migrationName = "supplier-taxonomy-restore-cake-after-four-roots";
const previousMigration = "supplier-taxonomy-four-roots-2026-09-28";
const cakeRoot = "مستلزمات الكيك";
const cakeBranches = [
  ["حشوات الكيك", "🍓"],
  ["خلطات الكيك", "🧁"],
  ["كريمة وتزيين", "🎨"],
  ["قوالب وأدوات تشكيل", "🎂"],
] as const;
const cakeBranchNames = new Set<string>(cakeBranches.map(([name]) => name));

// These are the approved pre-restructure destinations, not guesses based on
// today's item names. Only existing item records are eligible for restoration.
const formerDestinations = new Map<string, string>();
for (const { oldItemName, destinationNodeName } of approvedLegacyItemAssignments) {
  if (cakeBranchNames.has(destinationNodeName)) {
    formerDestinations.set(oldItemName, destinationNodeName);
  }
}
for (const group of suppliedTaxonomyItems) {
  if (group.root !== cakeRoot || !cakeBranchNames.has(group.branch)) continue;
  for (const name of group.names) {
    const previous = formerDestinations.get(name);
    if (previous && previous !== group.branch) {
      throw new Error(`Conflicting former cake destination for ${name}`);
    }
    formerDestinations.set(name, group.branch);
  }
}

export function restoreCakeSupplierTaxonomy(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM directory_migrations WHERE name = ?").get(migrationName)) return;
  const earlier = db.prepare(
    "SELECT applied_at AS appliedAt FROM directory_migrations WHERE name = ?",
  ).get(previousMigration) as { appliedAt: string } | undefined;
  if (!earlier) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    const now = new Date().toISOString();
    const beforeCount = (db.prepare(
      "SELECT COUNT(*) AS count FROM supplier_taxonomy_items",
    ).get() as { count: number }).count;
    const originalRoots = [
      "المواد الخام الغذائية", "مستلزمات التغليف والتقديم",
      "مستلزمات النظافة والسلامة", "الخدمات والاستشارات",
    ];
    const findRoot = db.prepare(
      "SELECT id FROM supplier_taxonomy_nodes WHERE parent_id IS NULL AND name = ?",
    );
    for (const name of originalRoots) {
      if (!findRoot.get(name)) throw new Error(`Cannot restore cake: missing ${name}`);
    }
    const insertNode = db.prepare(`
      INSERT INTO supplier_taxonomy_nodes
        (parent_id, name, icon, display_order, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `);
    const updateNode = db.prepare(`
      UPDATE supplier_taxonomy_nodes
      SET name = ?, icon = ?, display_order = ?, is_active = 1, updated_at = ?
      WHERE id = ?
    `);
    const existingCake = findRoot.get(cakeRoot) as { id: number } | undefined;
    const rootId = existingCake?.id
      ?? Number(insertNode.run(null, cakeRoot, "🍰", 2, now, now).lastInsertRowid);
    if (existingCake) updateNode.run(cakeRoot, "🍰", 2, now, rootId);
    const branchIds = new Map<string, number>();
    for (const [index, [name, icon]] of cakeBranches.entries()) {
      const existing = db.prepare(`
        SELECT id FROM supplier_taxonomy_nodes WHERE parent_id = ? AND name = ?
      `).get(rootId, name) as { id: number } | undefined;
      const id = existing?.id
        ?? Number(insertNode.run(rootId, name, icon, index + 1, now, now).lastInsertRowid);
      if (existing) updateNode.run(name, icon, index + 1, now, id);
      branchIds.set(name, id);
    }
    for (const [index, name] of [
      "المواد الخام الغذائية", cakeRoot, "مستلزمات التغليف والتقديم",
      "مستلزمات النظافة والسلامة", "الخدمات والاستشارات", "أصناف أخرى",
    ].entries()) {
      db.prepare(`
        UPDATE supplier_taxonomy_nodes SET display_order = ?, updated_at = ?
        WHERE parent_id IS NULL AND name = ?
      `).run(index + 1, now, name);
    }

    const allItems = db.prepare(
      "SELECT id, name, category_id AS categoryId FROM supplier_taxonomy_items",
    ).all() as Array<{ id: number; name: string; categoryId: number }>;
    const editedAfterRestructure = db.prepare(`
      SELECT 1 FROM supplier_taxonomy_audit_log
      WHERE entity_type = 'item' AND entity_id = ?
        AND created_at > ? AND action IN ('move', 'update')
      LIMIT 1
    `);
    const changePrimary = db.prepare(`
      UPDATE items_categories SET category_id = ?
      WHERE item_id = ? AND is_primary = 1
    `);
    const moved: Record<string, number[]> = Object.fromEntries(
      cakeBranches.map(([name]) => [name, [] as number[]]),
    );
    const skippedEdited: number[] = [];
    for (const item of allItems) {
      const former = formerDestinations.get(item.name);
      if (!former) continue;
      const target = branchIds.get(former)!;
      if (item.categoryId === target) continue;
      if (editedAfterRestructure.get(item.id, earlier.appliedAt)) {
        skippedEdited.push(item.id);
        continue;
      }
      // A secondary tag already pointing at the destination cannot collide
      // with the moved primary link; leave all other secondary tags intact.
      db.prepare(`
        DELETE FROM items_categories
        WHERE item_id = ? AND category_id = ? AND is_primary = 0
      `).run(item.id, target);
      db.prepare(`
        UPDATE supplier_taxonomy_items SET category_id = ?, updated_at = ?
        WHERE id = ?
      `).run(target, now, item.id);
      const result = changePrimary.run(target, item.id);
      if (Number(result.changes) === 0) {
        db.prepare(`
          INSERT OR IGNORE INTO items_categories
            (item_id, category_id, is_primary, created_at)
          VALUES (?, ?, 1, ?)
        `).run(item.id, target, now);
      }
      moved[former].push(item.id);
    }

    if ((db.prepare("SELECT COUNT(*) AS count FROM supplier_taxonomy_items")
      .get() as { count: number }).count !== beforeCount) {
      throw new Error("Cake restoration changed the item count");
    }
    if (db.prepare("PRAGMA foreign_key_check").all().length) {
      throw new Error("Cake restoration left invalid foreign keys");
    }
    const existingNames = new Set(allItems.map(({ name }) => name));
    db.prepare(`
      INSERT INTO supplier_taxonomy_audit_log
        (admin_id, action, entity_id, entity_type, details, created_at)
      VALUES (NULL, 'system-category-migration', ?, 'category', ?, ?)
    `).run(rootId, JSON.stringify({
      migrationName, cakeRootId: rootId,
      branchIds: Object.fromEntries(branchIds), moved,
      missingFormerNames: [...formerDestinations.keys()].filter((name) => !existingNames.has(name)),
      skippedEdited,
    }), now);
    db.prepare(
      "INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)",
    ).run(migrationName, now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}