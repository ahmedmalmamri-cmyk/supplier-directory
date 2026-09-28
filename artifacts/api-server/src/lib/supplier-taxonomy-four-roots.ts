import type { DatabaseSync } from "node:sqlite";

const migrationName = "supplier-taxonomy-four-roots-2026-09-28";

const tree = [
  { name: "المواد الخام الغذائية", icon: "🌾", former: ["المواد الأولية"], children: [
    ["دقيق وحبوب", "🌾", "دقيق وسكر"],
    ["سكر ومحليات", "🍯"],
    ["زيوت وسمن", "🫒", "زيوت ودهون"],
    ["حليب ومشتقاته", "🥛", "بيض وألبان"],
    ["بيض", "🥚"],
    ["خمائر ومحسنات", "🧪", "مواد رافعة ونكهات"],
    ["نكهات وملونات", "🎨"],
    ["مكسرات وفواكه", "🥜", "مكسرات وإضافات"],
  ] },
  { name: "مستلزمات التغليف والتقديم", icon: "📦", former: ["مستلزمات التغليف"], children: [
    ["علب كيك وحلويات", "📦", "علب الكيك"],
    ["أكياس وورق تغليف", "🛍️", "أكياس التغليف"],
    ["حافظات التوصيل", "🧺"],
    ["ملصقات وبطاقات", "🏷️", "ملصقات وأربطة"],
    ["أدوات تقديم", "🍽️"],
  ] },
  { name: "مستلزمات النظافة والسلامة", icon: "🧼", former: ["النظافة والسلامة", "النظافة والسلامة المهنية"], children: [
    ["منظفات غذائية", "🧴"],
    ["معقمات", "🧽", "أدوات تعقيم"],
    ["مستلزمات وقاية شخصية", "🧤"],
    ["مكافحة حشرات", "🛡️"],
  ] },
  { name: "الخدمات والاستشارات", icon: "🤝", former: [], children: [
    ["صيانة معدات", "🔧"],
    ["تركيب وتجهيز", "🛠️"],
    ["استشارات وتدريب", "📚"],
    ["توصيل وشحن", "🚚"],
  ] },
] as const;

type Node = { id: number; parent_id: number | null; name: string };
type Item = { id: number; name: string; category_id: number };

// Classify by the actual item, not its former broad group: old groups mix
// sugar with flour, eggs with dairy, and flavorings with leavening agents.
function destination(name: string, formerRoot: string): string {
  if (/صيانة|تركيب|استشارات|تدريب|خدمة توصيل|خدمة شحن/.test(name)) {
    if (/صيانة/.test(name)) return "صيانة معدات";
    if (/تركيب|تجهيز/.test(name)) return "تركيب وتجهيز";
    if (/استشارات|تدريب/.test(name)) return "استشارات وتدريب";
    return "توصيل وشحن";
  }
  if (/معدات|معدات المخابز/.test(formerRoot)) return "أصناف أخرى";
  if (/مكافحة حشرات|مبيد/.test(name)) return "مكافحة حشرات";
  if (/قفاز|مرايل|شبكة شعر|أقنعة|كمامات|وقاية/.test(name)) return "مستلزمات وقاية شخصية";
  if (/تعقيم|معقم|مطهر|أشعة فوق بنفسجية/.test(name)) return "معقمات";
  if (/منظف/.test(name)) return "منظفات غذائية";
  if (/تقديم|أطباق|صحون|ملاعق تقديم|أكواب تقديم/.test(name)) return "أدوات تقديم";
  if (/أكياس (?:ال)?تزيين|أكياس كريمة/.test(name)) return "أصناف أخرى";
  if (/توصيل|حافظات|حافظة|حرارية/.test(name) && /أكياس|صناديق|حافظات|حافظة/.test(name)) return "حافظات التوصيل";
  if (/ملصق|استيكر|لاصق|أربطة|بطاقات|شرائط/.test(name)) return "ملصقات وبطاقات";
  if (/علب|كراتين|صندوق كيك|علبة/.test(name)) return "علب كيك وحلويات";
  if (/أكياس|ورق|ألمنيوم|سلوفان|رول تغليف|عبوات وتغليف/.test(name)) return "أكياس وورق تغليف";
  // Production tools are not serving tools; equipment and ambiguous cake
  // supplies need a manual review instead of being advertised as food.
  if (/قوالب|أدوات تزيين|أدوات صغيرة|ملاعق معيارية|أكواب قياس|مبرشة|ملاقط|حبر طابعة|لمبة/.test(name)) return "أصناف أخرى";
  if (/عجين|خبز رقاق|كيك أرمكو|خليط|خلطات|مفرزنات|بسكويت|كاستر|جيلاتين|جيلي|كاتشب|مايونيز|صوص بيتزا|صوص حار|فوندان/.test(name)) return "أصناف أخرى";
  if (/زيت|زبدة|سمن|مارجرين|شورتنج|دهون/.test(name)) return "زيوت وسمن";
  if (/بيض/.test(name)) return "بيض";
  if (/حليب|لبن|زبادي|قشطة|كريمة خفق|كريمة طبخ|جبن|أجبان/.test(name)) return "حليب ومشتقاته";
  if (/خمير|محسن|بيكنج|بيكربونات|مانع عفن|مواد رافعة/.test(name)) return "خمائر ومحسنات";
  if (/دقيق|سميد|برغل|نخالة|دخن|شعير|نشا/.test(name)) return "دقيق وحبوب";
  if (/سكر|عسل|محليات|دبس تمر/.test(name)) return "سكر ومحليات";
  if (/مكسرات|لوز|بندق|جوز|فستق|زبيب|فواكه|كرز|أناناس|سمسم|حبة البركة|بيكان|فول سوداني|كاجو|تمر|توت|فراولة|مانجو|تفاح/.test(name)) return "مكسرات وفواكه";
  if (/نكه|لون|ألوان|ملونات|فانيليا|كاكاو|شوكولاتة|كراميل|عطور|مستخلصات|زعفران|قرفة|هيل|كمون|ينسون|سماق|زعتر|كركم|ملح ليمون|ماء ورد|ماء زهر|خل|حشوة|صوص شوكولاتة/.test(name)) return "نكهات وملونات";
  return "أصناف أخرى";
}

// Former node links (not item names) must also be remapped before deletion.
const formerBranches: Record<string, string> = {
  "المواد الأولية": "المواد الخام الغذائية",
  "دقيق وسكر": "المواد الخام الغذائية",
  "زيوت ودهون": "زيوت وسمن",
  "بيض وألبان": "المواد الخام الغذائية",
  "مواد رافعة ونكهات": "المواد الخام الغذائية",
  "مكسرات وإضافات": "المواد الخام الغذائية",
  "مستلزمات التغليف": "مستلزمات التغليف والتقديم",
  "علب الكيك": "علب كيك وحلويات",
  "أكياس التغليف": "أكياس وورق تغليف",
  "أوراق التغليف": "أكياس وورق تغليف",
  "ملصقات وأربطة": "ملصقات وبطاقات",
  "النظافة والسلامة": "مستلزمات النظافة والسلامة",
  "النظافة والسلامة المهنية": "مستلزمات النظافة والسلامة",
  "أدوات تعقيم": "معقمات",
  "مستلزمات الكيك": "أصناف أخرى",
  "حشوات الكيك": "أصناف أخرى",
  "خلطات الكيك": "أصناف أخرى",
  "كريمة وتزيين": "أصناف أخرى",
  "قوالب وأدوات تشكيل": "أصناف أخرى",
  "معدات المخابز": "أصناف أخرى",
  "معدات وتجهيزات المخابز": "أصناف أخرى",
  "معدات الخلط والعجن": "أصناف أخرى",
  "معدات التشكيل": "أصناف أخرى",
  "معدات الخبز": "أصناف أخرى",
  "معدات التجهيز والتبريد": "أصناف أخرى",
  "أصناف غير مصنفة": "أصناف أخرى",
};

const obsoleteItemHeadings = new Set([
  "زبدة ودهون", "حليب ومشتقاته", "أجبان", "زبادي وقشطة",
  "شوكولاتة وكاكاو", "عسل ومحليات", "خمائر ومحسنات",
  "نكهات وألوان", "فانيليا ومستخلصات", "علب وتغليف",
  "معدات وأفران", "أدوات صغيرة",
]);

export function applyFourRootSupplierTaxonomy(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM directory_migrations WHERE name = ?").get(migrationName)) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    const now = new Date().toISOString();
    const beforeNodes = db.prepare(
      "SELECT id, parent_id, name FROM supplier_taxonomy_nodes ORDER BY id",
    ).all() as Node[];
    const parents = new Map(beforeNodes.map((node) => [node.id, node]));
    const roots = new Map(beforeNodes.filter((node) => node.parent_id === null).map((node) => [node.id, node.name]));
    const items = db.prepare(
      "SELECT id, name, category_id FROM supplier_taxonomy_items ORDER BY id",
    ).all() as Item[];
    const oldLinks = db.prepare(
      "SELECT supplier_id, node_id, created_at FROM supplier_taxonomy_supplier_links",
    ).all() as Array<{ supplier_id: number; node_id: number; created_at: string }>;
    const oldSelections = db.prepare(
      "SELECT request_id, supplier_id, category_id, is_approved, created_at FROM supplier_category_selections",
    ).all() as Array<{ request_id: number; supplier_id: number | null; category_id: number; is_approved: number; created_at: string }>;
    const oldItemLinks = db.prepare("SELECT COUNT(*) AS count FROM items_categories").get() as { count: number };
    const targetIds = new Map<string, number>();
    const keep = new Set<number>();
    const reusedNames: string[] = [];
    const insertNode = db.prepare(`
      INSERT INTO supplier_taxonomy_nodes
        (parent_id, name, icon, display_order, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const upsertNode = (name: string, icon: string, parentId: number | null, order: number, aliases: readonly string[] = [], active = 1): number => {
      const existing = beforeNodes.find((node) =>
        node.parent_id === parentId && (node.name === name || aliases.includes(node.name)) && !keep.has(node.id),
      );
      const id = existing?.id ?? Number(insertNode.run(parentId, name, icon, order, active, now, now).lastInsertRowid);
      if (existing) {
        reusedNames.push(`${existing.name} → ${name}`);
        db.prepare(`
          UPDATE supplier_taxonomy_nodes
          SET parent_id = ?, name = ?, icon = ?, display_order = ?, is_active = ?, updated_at = ?
          WHERE id = ?
        `).run(parentId, name, icon, order, active, now, id);
      }
      keep.add(id);
      targetIds.set(name, id);
      return id;
    };
    for (const [index, group] of tree.entries()) {
      const rootId = upsertNode(group.name, group.icon, null, index + 1, group.former);
      group.children.forEach(([name, icon, former], childIndex) =>
        upsertNode(name, icon, rootId, childIndex + 1, former ? [former] : []),
      );
    }
    upsertNode("أصناف أخرى", "📋", null, 5, ["أصناف غير مصنفة"], 0);
    const otherId = targetIds.get("أصناف أخرى")!;
    const mapping = new Map(beforeNodes.map((node) => [
      node.id, targetIds.get(formerBranches[node.name] ?? node.name) ?? otherId,
    ]));
    const targetsFor = (id: number): number[] => {
      const name = parents.get(id)?.name;
      if (name === "دقيق وسكر") return [targetIds.get("دقيق وحبوب")!, targetIds.get("سكر ومحليات")!];
      if (name === "بيض وألبان") return [targetIds.get("حليب ومشتقاته")!, targetIds.get("بيض")!];
      if (name === "مواد رافعة ونكهات") return [targetIds.get("خمائر ومحسنات")!, targetIds.get("نكهات وملونات")!];
      return [mapping.get(id) ?? otherId];
    };
    const resolved = items.map((item) => {
      let root = parents.get(item.category_id);
      while (root?.parent_id !== null && root?.parent_id !== undefined) root = parents.get(root.parent_id);
      const branch = destination(item.name, roots.get(root?.id ?? -1) ?? "");
      return { ...item, target: targetIds.get(branch) ?? otherId, branch };
    });

    // All item IDs survive. Rebuild only valid primary associations; stale
    // cross-tags to removed headings and the old unclassified area disappear.
    db.exec("DELETE FROM items_categories");
    const moveItem = db.prepare(
      "UPDATE supplier_taxonomy_items SET category_id = ?, updated_at = ? WHERE id = ?",
    );
    const addItemLink = db.prepare(`
      INSERT INTO items_categories (item_id, category_id, is_primary, created_at)
      VALUES (?, ?, 1, ?)
    `);
    const hideObsoleteHeading = db.prepare(
      "UPDATE supplier_taxonomy_items SET is_active = 0 WHERE id = ?",
    );
    for (const item of resolved) {
      moveItem.run(item.target, now, item.id);
      addItemLink.run(item.id, item.target, now);
      if (obsoleteItemHeadings.has(item.name)) hideObsoleteHeading.run(item.id);
    }

    db.exec("DELETE FROM supplier_taxonomy_supplier_links");
    const addSupplierLink = db.prepare(`
      INSERT OR IGNORE INTO supplier_taxonomy_supplier_links (supplier_id, node_id, created_at)
      VALUES (?, ?, ?)
    `);
    for (const link of oldLinks) {
      for (const target of targetsFor(link.node_id)) addSupplierLink.run(link.supplier_id, target, link.created_at);
    }

    db.exec("DELETE FROM supplier_category_selections");
    const addSelection = db.prepare(`
      INSERT INTO supplier_category_selections
        (request_id, supplier_id, category_id, is_approved, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (request_id, category_id) DO UPDATE SET
        is_approved = MAX(is_approved, excluded.is_approved),
        supplier_id = COALESCE(supplier_id, excluded.supplier_id)
    `);
    for (const selection of oldSelections) {
      for (const target of targetsFor(selection.category_id)) {
        addSelection.run(selection.request_id, selection.supplier_id,
          target, selection.is_approved, selection.created_at);
      }
    }
    const requests = db.prepare(`
      SELECT id, selected_categories FROM supplier_requests WHERE selected_categories != '[]'
    `).all() as Array<{ id: number; selected_categories: string }>;
    for (const request of requests) {
      const parsed: unknown = JSON.parse(request.selected_categories);
      if (!Array.isArray(parsed)) throw new Error("Invalid supplier selected_categories array");
      const mapped = [...new Set(parsed.flatMap((id) =>
        typeof id === "number" && Number.isInteger(id) ? targetsFor(id) : [otherId],
      ))];
      db.prepare("UPDATE supplier_requests SET selected_categories = ? WHERE id = ?")
        .run(JSON.stringify(mapped), request.id);
    }

    // Reject accidental removal of a newly created branch: no item, link or
    // request may still point at an obsolete node before deleting it.
    const deleted = beforeNodes.filter((node) => !keep.has(node.id));
    for (const node of deleted) {
      db.prepare("DELETE FROM supplier_taxonomy_nodes WHERE id = ?").run(node.id);
    }
    const foreignKeyErrors = db.prepare("PRAGMA foreign_key_check").all();
    if (foreignKeyErrors.length) throw new Error(`Taxonomy migration left ${foreignKeyErrors.length} invalid foreign keys`);
    if ((db.prepare("SELECT COUNT(*) AS count FROM supplier_taxonomy_items").get() as { count: number }).count !== items.length) {
      throw new Error("Taxonomy migration lost item records");
    }
    const counts = Object.fromEntries([...targetIds.keys()].map((name) => [
      name, resolved.filter((item) => item.branch === name).length,
    ]));
    db.prepare(`
      INSERT INTO supplier_taxonomy_audit_log
        (admin_id, action, entity_id, entity_type, details, created_at)
      VALUES (NULL, 'system-category-migration', NULL, 'category', ?, ?)
    `).run(JSON.stringify({
      migrationName, reusedNames, removedNodes: deleted.map(({ id, name }) => ({ id, name })),
      originalItemLinks: oldItemLinks.count, itemCount: items.length,
      hiddenObsoleteItemHeadings: resolved.filter((item) => obsoleteItemHeadings.has(item.name)).map(({ id, name }) => ({ id, name })),
      remappedSupplierLinks: oldLinks.length, remappedSelections: oldSelections.length,
      categoryCounts: counts, stagedItems: resolved.filter((item) => item.branch === "أصناف أخرى").map(({ id, name }) => ({ id, name })),
    }), now);
    db.prepare("INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)").run(migrationName, now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// A correction for development databases that ran the first revision before
// Arabic plural "ألوان" was included in the classifier. Restricted to the two
// unmistakable food-coloring names still staged; never override admin moves.
export function correctStagedFoodColorings(db: DatabaseSync): void {
  const name = "supplier-taxonomy-four-roots-food-colors";
  if (db.prepare("SELECT 1 FROM directory_migrations WHERE name = ?").get(name)) return;
  const migrated = db.prepare("SELECT 1 FROM directory_migrations WHERE name = ?").get(migrationName);
  if (!migrated) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    const now = new Date().toISOString();
    const nodes = db.prepare(`
      SELECT name, id FROM supplier_taxonomy_nodes
      WHERE name IN ('أصناف أخرى', 'نكهات وملونات')
    `).all() as Array<{ name: string; id: number }>;
    const other = nodes.find((node) => node.name === "أصناف أخرى")?.id;
    const flavor = nodes.find((node) => node.name === "نكهات وملونات")?.id;
    if (!other || !flavor) throw new Error("Food-color correction requires both taxonomy nodes");
    const affected = db.prepare(`
      SELECT id FROM supplier_taxonomy_items
      WHERE category_id = ? AND name IN ('ألوان طعام', 'ألوان بودرة')
    `).all(other) as Array<{ id: number }>;
    for (const { id } of affected) {
      db.prepare("UPDATE supplier_taxonomy_items SET category_id = ?, updated_at = ? WHERE id = ?")
        .run(flavor, now, id);
      db.prepare("UPDATE items_categories SET category_id = ? WHERE item_id = ? AND category_id = ?")
        .run(flavor, id, other);
    }
    db.prepare("INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)").run(name, now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function stageDecoratingBags(db: DatabaseSync): void {
  const name = "supplier-taxonomy-four-roots-decorating-bags";
  if (db.prepare("SELECT 1 FROM directory_migrations WHERE name = ?").get(name)) return;
  if (!db.prepare("SELECT 1 FROM directory_migrations WHERE name = ?").get(migrationName)) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    const now = new Date().toISOString();
    const rows = db.prepare(`
      SELECT id, name FROM supplier_taxonomy_nodes
      WHERE name IN ('أصناف أخرى', 'أكياس وورق تغليف', 'حافظات التوصيل')
    `).all() as Array<{ id: number; name: string }>;
    const nodeId = (name: string) => rows.find((row) => row.name === name)?.id;
    const otherId = nodeId("أصناف أخرى");
    if (!otherId) throw new Error("Missing staged review root");
    const former = [nodeId("أكياس وورق تغليف"), nodeId("حافظات التوصيل")].filter(
      (id): id is number => id !== undefined,
    );
    if (former.length !== 2) throw new Error("Missing packaging branches");
    const items = db.prepare(`
      SELECT id FROM supplier_taxonomy_items
      WHERE category_id IN (?, ?) AND
        (name LIKE 'أكياس تزيين%' OR name = 'أكياس التزيين' OR name = 'أكياس كريمة')
    `).all(...former) as Array<{ id: number }>;
    for (const { id } of items) {
      db.prepare("UPDATE supplier_taxonomy_items SET category_id = ?, updated_at = ? WHERE id = ?")
        .run(otherId, now, id);
      db.prepare("UPDATE items_categories SET category_id = ? WHERE item_id = ? AND category_id IN (?, ?)")
        .run(otherId, id, ...former);
    }
    db.prepare("INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)").run(name, now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}