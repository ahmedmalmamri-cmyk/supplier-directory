import { Router, type IRouter, type Request, type Response } from "express";
import { directoryDb } from "../lib/directory-db";
import { requireAdmin } from "../lib/admin-auth";
import { getSupplierIdFromRequest } from "../lib/supplier-auth";
import { isTestModeRequest } from "../lib/test-mode";
import { publicSupplierTaxonomyCtes } from "../lib/public-supplier-taxonomy";
import { publicCatalogOfferEligibilitySql, publicCatalogVisibilitySql } from "../lib/catalog-visibility";

const router: IRouter = Router();
const deferredServicesNamesSql = "'الخدمات والاستشارات', 'خدمات واستشارات'";

function publicTaxonomyNodeCondition(alias: string, parentIdColumn = `${alias}.parent_id`) {
  return `lower(trim(${alias}.name)) NOT IN (${deferredServicesNamesSql})
    AND NOT EXISTS (
      SELECT 1 FROM supplier_taxonomy_nodes deferredRoot
      WHERE deferredRoot.id = ${parentIdColumn}
        AND lower(trim(deferredRoot.name)) IN (${deferredServicesNamesSql})
    )`;
}

type CatalogNameInput = { nameAr: string; nameEn: string };

function normalizedName(value: string) {
  return value.normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readNames(body: unknown): CatalogNameInput | null {
  if (!body || typeof body !== "object") return null;
  const input = body as Record<string, unknown>;
  if (typeof input.nameAr !== "string" || typeof input.nameEn !== "string") return null;
  const nameAr = input.nameAr.trim();
  const nameEn = input.nameEn.trim();
  if (!nameAr || !nameEn || nameAr.length > 120 || nameEn.length > 120) return null;
  return { nameAr, nameEn };
}

function validId(value: unknown): number | null {
  const id = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function validPrice(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function requireSupplier(req: Request, res: Response): number | null {
  if (isTestModeRequest(req, "buyer")) {
    res.status(401).json({ error: "جلسة المورد غير متاحة أثناء معاينة صاحب العمل." });
    return null;
  }
  const supplierId = getSupplierIdFromRequest(req);
  if (!supplierId) {
    res.status(401).json({ error: "يجب تسجيل دخول المورد أولاً." });
    return null;
  }
  const allowTestMode = isTestModeRequest(req, "supplier", supplierId);
  const account = directoryDb.prepare(`
    SELECT s.id
    FROM suppliers s
    JOIN supplier_users su ON su.supplier_id = s.id
    WHERE s.id = ? AND su.status = 'active'
      AND (s.is_active = 1 OR (? = 1 AND EXISTS (
        SELECT 1 FROM test_mode_accounts t WHERE t.role = 'supplier' AND t.entity_id = s.id
      )))
  `).get(supplierId, allowTestMode ? 1 : 0);
  if (!account) {
    res.status(401).json({ error: "صلاحية المورد غير متاحة حالياً." });
    return null;
  }
  return supplierId;
}

function getOffer(id: number, supplierId: number) {
  const row = directoryDb.prepare(`
    SELECT o.id, o.subtype_id AS subtypeId, st.item_id AS itemId,
      st.name_ar AS subtypeNameAr, st.name_en AS subtypeNameEn,
      st.status AS subtypeStatus, o.price, o.last_updated AS lastUpdated,
      o.is_active AS isActive,
      (${publicCatalogOfferEligibilitySql("o", "st", "i", "n")}) AS isPubliclyEligible
    FROM supplier_catalog_offers o
    JOIN supplier_catalog_subtypes st ON st.id = o.subtype_id
    JOIN supplier_taxonomy_items i ON i.id = st.item_id
    JOIN supplier_taxonomy_nodes n ON n.id = i.category_id
    WHERE o.id = ? AND o.supplier_id = ?
  `).get(id, supplierId);
  if (!row) return undefined;
  const offer = row as {
    id: number; subtypeId: number; itemId: number; subtypeNameAr: string;
    subtypeNameEn: string; subtypeStatus: string; price: number | null;
    lastUpdated: string; isActive: number; isPubliclyEligible: number;
  };
  return {
    id: offer.id,
    subtypeId: offer.subtypeId,
    price: offer.price,
    lastUpdated: offer.lastUpdated,
    isActive: Boolean(offer.isActive),
    eligibilityStatus: offer.isPubliclyEligible ? "eligible" : "pending",
  };
}

router.get("/supplier/catalog", (req, res): void => {
  const supplierId = requireSupplier(req, res);
  if (!supplierId) return;
  const supplier = directoryDb.prepare(`
    SELECT is_active AS isActive FROM suppliers WHERE id = ?
  `).get(supplierId) as { isActive: number } | undefined;
  const masters = directoryDb.prepare(`
    ${publicSupplierTaxonomyCtes}
    SELECT i.id, i.name, i.name_en AS nameEn
    FROM supplier_taxonomy_items i
    JOIN active_nodes n ON n.id = i.category_id
    WHERE i.is_active = 1 AND ${publicTaxonomyNodeCondition("n", "n.parentId")}
    ORDER BY i.name COLLATE NOCASE, i.id
  `).all() as Array<{ id: number; name: string; nameEn: string | null }>;
  const subtypeRows = directoryDb.prepare(`
    SELECT id, item_id AS itemId, name_ar AS nameAr, name_en AS nameEn,
      status, is_approved AS isApproved
    FROM supplier_catalog_subtypes
    WHERE status = 'approved' OR proposed_by_supplier_id = ?
    ORDER BY item_id, name_ar COLLATE NOCASE, id
  `).all(supplierId) as Array<{
    id: number; itemId: number; nameAr: string; nameEn: string; status: string; isApproved: number;
  }>;
  const offerRows = directoryDb.prepare(`
    ${publicSupplierTaxonomyCtes}
    SELECT o.id, o.subtype_id AS subtypeId, st.item_id AS itemId, o.price,
      o.last_updated AS lastUpdated, o.is_active AS isActive,
      st.status AS subtypeStatus,
      st.is_approved AS subtypeIsApproved,
      (${publicCatalogOfferEligibilitySql("o", "st", "i", "n")}) AS isPubliclyEligible
    FROM supplier_catalog_offers o
    JOIN supplier_catalog_subtypes st ON st.id = o.subtype_id
    JOIN supplier_taxonomy_items i ON i.id = st.item_id
    JOIN supplier_taxonomy_nodes n ON n.id = i.category_id
    WHERE o.supplier_id = ?
      AND EXISTS (SELECT 1 FROM active_item_nodes publicItem WHERE publicItem.itemId = st.item_id)
      AND ${publicTaxonomyNodeCondition("n")}
    ORDER BY o.id
  `).all(supplierId) as Array<{
    id: number; subtypeId: number; itemId: number; price: number | null;
    lastUpdated: string; isActive: number; subtypeStatus: string;
    subtypeIsApproved: number; isPubliclyEligible: number;
  }>;
  const masterProposals = directoryDb.prepare(`
    SELECT id, name_ar AS nameAr, name_en AS nameEn, status, created_at AS createdAt
    FROM supplier_catalog_master_proposals
    WHERE supplier_id = ?
    ORDER BY id DESC
  `).all(supplierId);
  const subtypes = subtypeRows.map((subtype) => ({
    id: subtype.id,
    nameAr: subtype.nameAr,
    nameEn: subtype.nameEn,
    status: subtype.status,
    isApproved: Boolean(subtype.isApproved),
  }));
  const offers = offerRows.map((offer) => ({
    id: offer.id,
    subtypeId: offer.subtypeId,
    price: offer.price,
    lastUpdated: offer.lastUpdated,
    isActive: Boolean(offer.isActive),
    eligibilityStatus: offer.isPubliclyEligible ? "eligible" : "pending",
  }));
  res.json({
    profileComplete: Boolean(supplier?.isActive && (directoryDb.prepare(`
      SELECT ${publicCatalogVisibilitySql("s")} AS isVisible
      FROM suppliers s WHERE s.id = ?
    `).get(supplierId) as { isVisible: number } | undefined)?.isVisible),
    masters: masters.map((master) => ({
      id: master.id,
      name: master.name,
      nameEn: master.nameEn,
      subtypes: subtypes.filter((subtype) =>
        subtypeRows.some((row) => row.id === subtype.id && row.itemId === master.id)),
      offers: offers.filter((offer) =>
        offerRows.some((row) => row.id === offer.id && row.itemId === master.id)),
    })),
    pendingProposals: {
      subtypes: subtypeRows
        .filter((subtype) => subtype.status === "pending")
        .map((subtype) => ({
          id: subtype.id, itemId: subtype.itemId, nameAr: subtype.nameAr, nameEn: subtype.nameEn,
        })),
      masters: masterProposals,
    },
  });
});

router.post("/supplier/catalog/offers", (req, res): void => {
  const supplierId = requireSupplier(req, res);
  if (!supplierId) return;
  const itemId = validId(req.body?.itemId);
  const subtypeId = req.body?.subtypeId === undefined ? null : validId(req.body.subtypeId);
  const newSubtype = req.body?.newSubtype;
  const hasNewSubtype = newSubtype !== undefined;
  const price = req.body?.price === undefined ? null : req.body.price;
  if (!itemId || (req.body?.subtypeId !== undefined && !subtypeId)
    || (hasNewSubtype && subtypeId !== null)
    || (req.body?.price !== undefined && !validPrice(price))) {
    res.status(400).json({ error: "بيانات العرض غير صحيحة." });
    return;
  }
  const item = directoryDb.prepare(`
    ${publicSupplierTaxonomyCtes}
    SELECT i.id FROM supplier_taxonomy_items i
    JOIN active_item_nodes publicItem ON publicItem.itemId = i.id
    JOIN supplier_taxonomy_nodes n ON n.id = i.category_id
    WHERE i.id = ? AND ${publicTaxonomyNodeCondition("n")}
  `).get(itemId);
  if (!item) {
    res.status(404).json({ error: "الصنف الرئيسي غير متاح." });
    return;
  }
  let newSubtypeNames: CatalogNameInput | null = null;
  if (hasNewSubtype) {
    newSubtypeNames = readNames(newSubtype);
    if (!newSubtypeNames) {
      res.status(400).json({ error: "اسم النوع بالعربية والإنجليزية مطلوب." });
      return;
    }
    const existing = directoryDb.prepare(`
      SELECT name_ar AS nameAr, name_en AS nameEn
      FROM supplier_catalog_subtypes WHERE item_id = ? AND status <> 'rejected'
    `).all(itemId) as Array<{ nameAr: string; nameEn: string }>;
    if (existing.some((row) => normalizedName(row.nameAr) === normalizedName(newSubtypeNames!.nameAr)
      || normalizedName(row.nameEn) === normalizedName(newSubtypeNames!.nameEn))) {
      res.status(409).json({ error: "يوجد نوع بهذا الاسم ضمن الصنف." });
      return;
    }
  } else if (subtypeId === null) {
    res.status(400).json({ error: "حدد نوعاً معتمداً أو اقترح نوعاً جديداً." });
    return;
  }
  if (!newSubtypeNames) {
    const subtype = directoryDb.prepare(`
      SELECT id FROM supplier_catalog_subtypes
      WHERE id = ? AND item_id = ? AND (status = 'approved' OR proposed_by_supplier_id = ?)
    `).get(subtypeId, itemId, supplierId);
    if (!subtype) {
      res.status(400).json({ error: "النوع المحدد لا يتبع الصنف أو غير متاح للمورد." });
      return;
    }
  }
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN IMMEDIATE");
  try {
    let selectedSubtypeId = subtypeId;
    if (newSubtypeNames) {
      selectedSubtypeId = Number(directoryDb.prepare(`
        INSERT INTO supplier_catalog_subtypes
          (item_id, name_ar, name_en, is_approved, status, proposed_by_supplier_id, created_at, updated_at)
        VALUES (?, ?, ?, 0, 'pending', ?, ?, ?)
      `).run(itemId, newSubtypeNames.nameAr, newSubtypeNames.nameEn, supplierId, now, now).lastInsertRowid);
    }
    if (selectedSubtypeId === null) throw new Error("Missing subtype after request validation");
    const existingOffer = directoryDb.prepare(`
      SELECT id FROM supplier_catalog_offers WHERE supplier_id = ? AND subtype_id = ?
    `).get(supplierId, selectedSubtypeId) as { id: number } | undefined;
    let offerId: number;
    if (existingOffer) {
      directoryDb.prepare(`
        UPDATE supplier_catalog_offers
        SET price = ?, last_updated = ?, is_active = 1 WHERE id = ? AND supplier_id = ?
      `).run(price, now, existingOffer.id, supplierId);
      offerId = existingOffer.id;
    } else {
      offerId = Number(directoryDb.prepare(`
        INSERT INTO supplier_catalog_offers (supplier_id, subtype_id, price, last_updated, is_active)
        VALUES (?, ?, ?, ?, 1)
      `).run(supplierId, selectedSubtypeId, price, now).lastInsertRowid);
    }
    directoryDb.prepare(`
      INSERT OR IGNORE INTO supplier_taxonomy_item_suppliers (supplier_id, item_id, created_at)
      VALUES (?, ?, ?)
    `).run(supplierId, itemId, now);
    directoryDb.exec("COMMIT");
    res.status(201).json(getOffer(offerId, supplierId));
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not create supplier catalog offer");
    res.status(409).json({ error: "تعذر حفظ العرض." });
  }
});

router.patch("/supplier/catalog/offers/:id", (req, res): void => {
  const supplierId = requireSupplier(req, res);
  if (!supplierId) return;
  const id = validId(req.params.id);
  if (!id || !req.body || !Object.hasOwn(req.body, "price") || !validPrice(req.body.price)) {
    res.status(400).json({ error: "السعر يجب أن يكون رقماً موجباً أو null." });
    return;
  }
  const offer = directoryDb.prepare(`
    SELECT id FROM supplier_catalog_offers WHERE id = ? AND supplier_id = ?
  `).get(id, supplierId);
  if (!offer) {
    res.status(404).json({ error: "العرض غير موجود." });
    return;
  }
  directoryDb.prepare(`
    UPDATE supplier_catalog_offers SET price = ?, last_updated = ? WHERE id = ? AND supplier_id = ?
  `).run(req.body.price, new Date().toISOString(), id, supplierId);
  res.json(getOffer(id, supplierId));
});

router.delete("/supplier/catalog/offers/:id", (req, res): void => {
  const supplierId = requireSupplier(req, res);
  if (!supplierId) return;
  const id = validId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "معرّف العرض غير صحيح." });
    return;
  }
  const result = directoryDb.prepare(`
    UPDATE supplier_catalog_offers
    SET is_active = 0, last_updated = ?
    WHERE id = ? AND supplier_id = ?
  `).run(new Date().toISOString(), id, supplierId);
  if (!result.changes) {
    res.status(404).json({ error: "العرض غير موجود." });
    return;
  }
  res.json({ id, isActive: false });
});

router.post("/supplier/catalog/master-proposals", (req, res): void => {
  const supplierId = requireSupplier(req, res);
  if (!supplierId) return;
  const names = readNames(req.body);
  if (!names) {
    res.status(400).json({ error: "اسم الصنف بالعربية والإنجليزية مطلوب." });
    return;
  }
  const items = directoryDb.prepare(`
    SELECT i.name AS nameAr, i.name_en AS nameEn
    FROM supplier_taxonomy_items i
  `).all() as Array<{ nameAr: string; nameEn: string | null }>;
  const proposals = directoryDb.prepare(`
    SELECT name_ar AS nameAr, name_en AS nameEn
    FROM supplier_catalog_master_proposals WHERE status <> 'rejected'
  `).all() as Array<{ nameAr: string; nameEn: string }>;
  if ([...items, ...proposals].some((entry) =>
    normalizedName(entry.nameAr) === normalizedName(names.nameAr)
      || (entry.nameEn && normalizedName(entry.nameEn) === normalizedName(names.nameEn)))) {
    res.status(409).json({ error: "يوجد صنف أو اقتراح بهذا الاسم بالفعل." });
    return;
  }
  const result = directoryDb.prepare(`
    INSERT INTO supplier_catalog_master_proposals
      (name_ar, name_en, supplier_id, status, created_at)
    VALUES (?, ?, ?, 'pending', ?)
  `).run(names.nameAr, names.nameEn, supplierId, new Date().toISOString());
  res.status(201).json({
    id: Number(result.lastInsertRowid),
    nameAr: names.nameAr,
    nameEn: names.nameEn,
    status: "pending",
  });
});

router.get("/admin/catalog", (_req, res): void => {
  if (!requireAdmin(_req, res)) return;
  const masterRows = directoryDb.prepare(`
    SELECT i.id, i.name AS nameAr, i.name_en AS nameEn, i.category_id AS categoryId,
      n.name AS categoryName, i.is_active AS isActive
    FROM supplier_taxonomy_items i
    JOIN supplier_taxonomy_nodes n ON n.id = i.category_id
    ORDER BY i.name COLLATE NOCASE, i.id
  `).all() as Array<Record<string, unknown> & { id: number }>;
  const masters = masterRows.map((master) => ({ ...master, isActive: Boolean(master.isActive) }));
  const subtypeRows = directoryDb.prepare(`
    SELECT st.id, st.item_id AS itemId, st.name_ar AS nameAr, st.name_en AS nameEn,
      st.status, st.is_approved AS isApproved,
      st.proposed_by_supplier_id AS proposedBySupplierId, st.created_at AS createdAt,
      st.reviewed_at AS reviewedAt
    FROM supplier_catalog_subtypes st
    ORDER BY st.item_id, st.id
  `).all() as Array<Record<string, unknown> & { status: string }>;
  const subtypes = subtypeRows.map((subtype) => ({
    ...subtype,
    isApproved: Boolean(subtype.isApproved),
  }));
  const proposals = directoryDb.prepare(`
    SELECT p.id, p.name_ar AS nameAr, p.name_en AS nameEn, p.supplier_id AS supplierId,
      s.name AS supplierName, p.status, p.category_id AS categoryId, p.item_id AS itemId,
      p.created_at AS createdAt, p.reviewed_at AS reviewedAt
    FROM supplier_catalog_master_proposals p
    JOIN suppliers s ON s.id = p.supplier_id
    ORDER BY p.id DESC
  `).all();
  const supplierAccounts = directoryDb.prepare(`
    SELECT COUNT(*) AS count FROM supplier_users WHERE status = 'active'
  `).get() as { count: number };
  const completeProfiles = directoryDb.prepare(`
    SELECT COUNT(DISTINCT s.id) AS count
    FROM suppliers s
    JOIN supplier_users su ON su.supplier_id = s.id AND su.status = 'active'
    WHERE s.is_active = 1 AND ${publicCatalogVisibilitySql("s")}
  `).get() as { count: number };
  const stats = {
    activeMasters: masters.filter((master) => Boolean(master.isActive)).length,
    totalSubtypes: subtypes.length,
    pendingSubtypes: subtypes.filter((subtype) => subtype.status === "pending").length,
    pendingMasterProposals: proposals.filter((proposal) =>
      (proposal as { status: string }).status === "pending").length,
    supplierAccounts: supplierAccounts.count,
    completeSupplierProfiles: completeProfiles.count,
    approvedSubtypes: subtypes.filter((subtype) =>
      subtype.status === "approved" && Boolean(subtype.isApproved)).length,
    pendingProposals: subtypes.filter((subtype) => subtype.status === "pending").length
      + proposals.filter((proposal) =>
        (proposal as { status: string }).status === "pending").length,
  };
  res.json({ masters, subtypes, masterProposals: proposals, stats });
});

router.post("/admin/catalog/masters", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const names = readNames(req.body);
  const categoryId = validId(req.body?.categoryId);
  if (!names || !categoryId) {
    res.status(400).json({ error: "أدخل اسم الصنف بالعربية والإنجليزية والقسم." });
    return;
  }
  const category = directoryDb.prepare(`
    SELECT id FROM supplier_taxonomy_nodes WHERE id = ? AND is_active = 1
  `).get(categoryId);
  if (!category) {
    res.status(400).json({ error: "القسم المحدد غير متاح." });
    return;
  }
  const existing = directoryDb.prepare(`
    SELECT name AS nameAr, name_en AS nameEn FROM supplier_taxonomy_items
  `).all() as Array<{ nameAr: string; nameEn: string | null }>;
  if (existing.some((entry) => normalizedName(entry.nameAr) === normalizedName(names.nameAr)
    || (entry.nameEn && normalizedName(entry.nameEn) === normalizedName(names.nameEn)))) {
    res.status(409).json({ error: "يوجد صنف رئيسي بهذا الاسم بالفعل." });
    return;
  }
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    const result = directoryDb.prepare(`
      INSERT INTO supplier_taxonomy_items (name, name_en, category_id, is_active, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `).run(names.nameAr, names.nameEn, categoryId, now, now);
    const id = Number(result.lastInsertRowid);
    directoryDb.prepare(`
      INSERT INTO items_categories (item_id, category_id, is_primary, created_at) VALUES (?, ?, 1, ?)
    `).run(id, categoryId, now);
    directoryDb.exec("COMMIT");
    const categoryName = directoryDb.prepare("SELECT name FROM supplier_taxonomy_nodes WHERE id = ?")
      .get(categoryId) as { name: string };
    res.status(201).json({
      id, nameAr: names.nameAr, nameEn: names.nameEn, categoryId,
      categoryName: categoryName.name, isActive: true,
    });
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not create supplier catalog master");
    res.status(409).json({ error: "تعذر إنشاء الصنف الرئيسي بالاسم المحدد." });
  }
});

router.patch("/admin/catalog/masters/:id", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const id = validId(req.params.id);
  const nameEn = typeof req.body?.nameEn === "string" ? req.body.nameEn.trim() : null;
  if (!id || nameEn === null || !nameEn || nameEn.length > 120) {
    res.status(400).json({ error: "الترجمة الإنجليزية مطلوبة." });
    return;
  }
  const item = directoryDb.prepare(`
    SELECT id FROM supplier_taxonomy_items WHERE id = ?
  `).get(id);
  if (!item) {
    res.status(404).json({ error: "الصنف الرئيسي غير موجود." });
    return;
  }
  const duplicateRows = directoryDb.prepare(`
    SELECT id, name_en AS nameEn FROM supplier_taxonomy_items WHERE id <> ? AND name_en IS NOT NULL
  `).all(id) as Array<{ id: number; nameEn: string }>;
  if (duplicateRows.some((row) => normalizedName(row.nameEn) === normalizedName(nameEn))) {
    res.status(409).json({ error: "الاسم الإنجليزي مستخدم لصنف آخر." });
    return;
  }
  directoryDb.prepare("UPDATE supplier_taxonomy_items SET name_en = ?, updated_at = ? WHERE id = ?")
    .run(nameEn, new Date().toISOString(), id);
  res.json({ id, nameEn });
});

router.post("/admin/catalog/subtypes", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const itemId = validId(req.body?.itemId);
  const names = readNames(req.body);
  if (!itemId || !names) {
    res.status(400).json({ error: "أدخل الصنف واسم النوع بالعربية والإنجليزية." });
    return;
  }
  if (!directoryDb.prepare("SELECT id FROM supplier_taxonomy_items WHERE id = ?").get(itemId)) {
    res.status(404).json({ error: "الصنف الرئيسي غير موجود." });
    return;
  }
  const existing = directoryDb.prepare(`
    SELECT name_ar AS nameAr, name_en AS nameEn
    FROM supplier_catalog_subtypes WHERE item_id = ?
  `).all(itemId) as Array<{ nameAr: string; nameEn: string }>;
  if (existing.some((entry) => normalizedName(entry.nameAr) === normalizedName(names.nameAr)
    || normalizedName(entry.nameEn) === normalizedName(names.nameEn))) {
    res.status(409).json({ error: "يوجد نوع بهذا الاسم ضمن الصنف." });
    return;
  }
  const now = new Date().toISOString();
  const result = directoryDb.prepare(`
    INSERT INTO supplier_catalog_subtypes
      (item_id, name_ar, name_en, is_approved, status, reviewed_at, created_at, updated_at)
    VALUES (?, ?, ?, 1, 'approved', ?, ?, ?)
  `).run(itemId, names.nameAr, names.nameEn, now, now, now);
  res.status(201).json({
    id: Number(result.lastInsertRowid), itemId, nameAr: names.nameAr, nameEn: names.nameEn,
    isApproved: true, status: "approved", reviewedAt: now,
  });
});

router.patch("/admin/catalog/subtypes/:id/review", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const id = validId(req.params.id);
  const decision = req.body?.decision;
  if (!id || (decision !== "approved" && decision !== "rejected")) {
    res.status(400).json({ error: "قرار المراجعة غير صحيح." });
    return;
  }
  const subtype = directoryDb.prepare("SELECT id FROM supplier_catalog_subtypes WHERE id = ?").get(id);
  if (!subtype) {
    res.status(404).json({ error: "اقتراح النوع غير موجود." });
    return;
  }
  const current = directoryDb.prepare("SELECT status FROM supplier_catalog_subtypes WHERE id = ?")
    .get(id) as { status: string };
  if (current.status !== "pending") {
    res.status(409).json({ error: "تمت مراجعة اقتراح النوع مسبقاً." });
    return;
  }
  const now = new Date().toISOString();
  directoryDb.prepare(`
    UPDATE supplier_catalog_subtypes
    SET status = ?, is_approved = ?, reviewed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(decision, decision === "approved" ? 1 : 0, now, now, id);
  res.json({ id, status: decision, isApproved: decision === "approved", reviewedAt: now });
});

router.patch("/admin/catalog/master-proposals/:id/review", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const id = validId(req.params.id);
  const decision = req.body?.decision;
  const categoryId = req.body?.categoryId === undefined ? null : validId(req.body.categoryId);
  if (!id || (decision !== "approved" && decision !== "rejected")
    || (decision === "approved" && !categoryId)
    || (req.body?.categoryId !== undefined && !categoryId)) {
    res.status(400).json({ error: "قرار المراجعة والقسم المطلوبان غير صحيحين." });
    return;
  }
  const proposal = directoryDb.prepare(`
    SELECT id, name_ar AS nameAr, name_en AS nameEn, status FROM supplier_catalog_master_proposals WHERE id = ?
  `).get(id) as { id: number; nameAr: string; nameEn: string; status: string } | undefined;
  if (!proposal) {
    res.status(404).json({ error: "اقتراح الصنف الرئيسي غير موجود." });
    return;
  }
  if (proposal.status !== "pending") {
    res.status(409).json({ error: "تمت مراجعة اقتراح الصنف الرئيسي مسبقاً." });
    return;
  }
  if (decision === "approved") {
    const category = directoryDb.prepare(`
      SELECT id FROM supplier_taxonomy_nodes WHERE id = ? AND is_active = 1
    `).get(categoryId);
    if (!category) {
      res.status(400).json({ error: "القسم المحدد غير متاح." });
      return;
    }
    const existing = directoryDb.prepare(`
      SELECT name AS nameAr, name_en AS nameEn FROM supplier_taxonomy_items
    `).all() as Array<{ nameAr: string; nameEn: string | null }>;
    if (existing.some((entry) => normalizedName(entry.nameAr) === normalizedName(proposal.nameAr)
      || (entry.nameEn && normalizedName(entry.nameEn) === normalizedName(proposal.nameEn)))) {
      res.status(409).json({ error: "يوجد صنف رئيسي بهذا الاسم بالفعل." });
      return;
    }
  }
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    let itemId: number | null = null;
    if (decision === "approved") {
      const result = directoryDb.prepare(`
        INSERT INTO supplier_taxonomy_items (name, name_en, category_id, is_active, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?)
      `).run(proposal.nameAr, proposal.nameEn, categoryId, now, now);
      itemId = Number(result.lastInsertRowid);
      directoryDb.prepare(`
        INSERT INTO items_categories (item_id, category_id, is_primary, created_at) VALUES (?, ?, 1, ?)
      `).run(itemId, categoryId, now);
    }
    directoryDb.prepare(`
      UPDATE supplier_catalog_master_proposals
      SET status = ?, category_id = ?, item_id = ?, reviewed_at = ? WHERE id = ?
    `).run(decision, decision === "approved" ? categoryId : null, itemId, now, id);
    directoryDb.exec("COMMIT");
    res.json({ id, status: decision, itemId, categoryId: decision === "approved" ? categoryId : null, reviewedAt: now });
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not review supplier catalog master proposal");
    res.status(409).json({ error: "تعذر اعتماد اقتراح الصنف الرئيسي." });
  }
});

export default router;