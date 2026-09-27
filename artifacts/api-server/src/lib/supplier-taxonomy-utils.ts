import type { DatabaseSync } from "node:sqlite";

export function wouldCreateTaxonomyCycle(nodeId: number, parentId: number | null, descendantIds: readonly number[]) {
  return parentId !== null && (parentId === nodeId || descendantIds.includes(parentId));
}

export function transferTaxonomyRoot(database: DatabaseSync, rootId: number, targetId: number, now: string) {
  const children = database.prepare(`
    SELECT id, display_order AS displayOrder
    FROM supplier_taxonomy_nodes WHERE parent_id = ?
    ORDER BY display_order, id
  `).all(rootId) as Array<{ id: number; displayOrder: number }>;
  const lastTargetOrder = (database.prepare(`
    SELECT COALESCE(MAX(display_order), 0) AS maxOrder
    FROM supplier_taxonomy_nodes WHERE parent_id = ?
  `).get(targetId) as { maxOrder: number }).maxOrder;
  const directItemCount = (database.prepare(`
    SELECT COUNT(*) AS count FROM supplier_taxonomy_items WHERE category_id = ?
  `).get(rootId) as { count: number }).count;

  const updateChild = database.prepare(`
    UPDATE supplier_taxonomy_nodes
    SET parent_id = ?, display_order = ?, updated_at = ? WHERE id = ?
  `);
  children.forEach((child, index) => updateChild.run(targetId, lastTargetOrder + index + 1, now, child.id));
  database.prepare(`
    UPDATE supplier_taxonomy_items SET category_id = ?, updated_at = ? WHERE category_id = ?
  `).run(targetId, now, rootId);
  const hasLegacyNodeMappings = Boolean(database.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'supplier_taxonomy_legacy_mappings'
  `).get());
  if (hasLegacyNodeMappings) {
    database.prepare(`
      UPDATE supplier_taxonomy_legacy_mappings SET taxonomy_node_id = ?
      WHERE taxonomy_node_id = ?
    `).run(targetId, rootId);
  }
  database.prepare(`
    INSERT OR IGNORE INTO supplier_taxonomy_supplier_links (supplier_id, node_id, created_at)
    SELECT supplier_id, ?, created_at FROM supplier_taxonomy_supplier_links WHERE node_id = ?
  `).run(targetId, rootId);
  database.prepare("DELETE FROM supplier_taxonomy_nodes WHERE id = ?").run(rootId);
  return {
    deletedNodeCount: 1,
    transferredItemCount: directItemCount,
    transferredChildIds: children.map(({ id }) => id),
  };
}

export function planUniqueTrimmedNames(names: readonly string[], existingNames: ReadonlySet<string>) {
  const seen = new Set<string>();
  const acceptedIndexes: number[] = [];
  let skipped = 0;
  names.forEach((rawName, index) => {
    const name = rawName.trim();
    if (existingNames.has(name) || seen.has(name)) {
      skipped += 1;
      return;
    }
    seen.add(name);
    acceptedIndexes.push(index);
  });
  return { acceptedIndexes, skipped };
}

export function legacyMappingConflict(previousItemId: number | null, requestedItemId: number) {
  return previousItemId !== null && previousItemId !== requestedItemId;
}

export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}