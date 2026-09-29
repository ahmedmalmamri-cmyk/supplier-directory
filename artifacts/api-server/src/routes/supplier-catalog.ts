import { Router, type IRouter, type Request, type Response } from "express";
import { directoryDb } from "../lib/directory-db";
import { requireAdmin } from "../lib/admin-auth";
import { getSupplierIdFromRequest } from "../lib/supplier-auth";
import { isTestModeRequest } from "../lib/test-mode";
import { publicSupplierTaxonomyCtes } from "../lib/public-supplier-taxonomy";
import { publicCatalogOfferEligibilitySql, publicCatalogVisibilitySql } from "../lib/catalog-visibility";
import {
  listPublicSupplierTaxonomyItems,
  resolvePublicSupplierTaxonomySelection,
} from "../lib/public-supplier-taxonomy";
import { getAlmondItemIds } from "../lib/almond-variants";

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

function readNameList(value: unknown): CatalogNameInput[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return null;
  const names = value.map(readNames);
  if (names.some((name) => name === null)) return null;
  const seen = new Set<string>();
  for (const name of names as CatalogNameInput[]) {
    const key = `${normalizedName(name.nameAr)}|${normalizedName(name.nameEn)}`;
    if (seen.has(key)) return null;
    seen.add(key);
  }
  return names as CatalogNameInput[];
}

function validId(value: unknown): number | null {
  const id = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function validPrice(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function getItemForms(itemId: number, activeOnly = true) {
  return directoryDb.prepare(`
    SELECT id, item_id AS itemId, name_ar AS nameAr, name_en AS nameEn,
      is_active AS isActive
    FROM supplier_catalog_item_forms
    WHERE item_id = ? ${activeOnly ? "AND is_active = 1" : ""}
    ORDER BY id
  `).all(itemId).map((row) => {
    const form = row as { id: number; itemId: number; nameAr: string; nameEn: string; isActive: number };
    return { ...form, isActive: Boolean(form.isActive) };
  });
}

function getItemAttributes(itemId: number, activeOnly = true) {
  const rows = directoryDb.prepare(`
    SELECT a.id, a.item_id AS itemId, a.name_ar AS nameAr, a.name_en AS nameEn,
      a.is_active AS isActive,
      o.id AS optionId, o.name_ar AS optionNameAr, o.name_en AS optionNameEn,
      o.is_active AS optionIsActive
    FROM supplier_catalog_item_attributes a
    LEFT JOIN supplier_catalog_item_attribute_options o
      ON o.attribute_id = a.id ${activeOnly ? "AND o.is_active = 1" : ""}
    WHERE a.item_id = ? ${activeOnly ? "AND a.is_active = 1" : ""}
    ORDER BY a.id, o.id
  `).all(itemId) as Array<{
    id: number; itemId: number; nameAr: string; nameEn: string; isActive: number;
    optionId: number | null; optionNameAr: string | null; optionNameEn: string | null; optionIsActive: number | null;
  }>;
  const byAttribute = new Map<number, {
    id: number; itemId: number; nameAr: string; nameEn: string; isActive: boolean;
    options: Array<{ id: number; attributeId: number; nameAr: string; nameEn: string; isActive: boolean }>;
  }>();
  for (const row of rows) {
    const attribute = byAttribute.get(row.id) ?? {
      id: row.id, itemId: row.itemId, nameAr: row.nameAr, nameEn: row.nameEn,
      isActive: Boolean(row.isActive), options: [],
    };
    if (row.optionId !== null) {
      attribute.options.push({
        id: row.optionId,
        attributeId: row.id,
        nameAr: row.optionNameAr!,
        nameEn: row.optionNameEn!,
        isActive: Boolean(row.optionIsActive),
      });
    }
    byAttribute.set(row.id, attribute);
  }
  return [...byAttribute.values()];
}

function itemConfiguration(itemId: number, activeOnly = true) {
  return { forms: getItemForms(itemId, activeOnly), attributes: getItemAttributes(itemId, activeOnly) };
}

function isDuplicateName(existing: Array<{ nameAr: string; nameEn: string }>, name: CatalogNameInput) {
  return existing.some((entry) =>
    normalizedName(entry.nameAr) === normalizedName(name.nameAr)
      || normalizedName(entry.nameEn) === normalizedName(name.nameEn));
}

function validOptionsForItem(itemId: number, value: unknown): number[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((id) => validId(id) === null)) return null;
  const ids = [...new Set((value as unknown[]).map((id) => validId(id)!))];
  if (ids.length !== value.length) return null;
  const options = ids.length
    ? directoryDb.prepare(`
        SELECT option.id, option.attribute_id AS attributeId
        FROM supplier_catalog_item_attribute_options option
        JOIN supplier_catalog_item_attributes attribute
          ON attribute.id = option.attribute_id AND attribute.item_id = ? AND attribute.is_active = 1
        WHERE option.is_active = 1 AND option.id IN (${ids.map(() => "?").join(", ")})
      `).all(itemId, ...ids) as Array<{ id: number; attributeId: number }>
    : [];
  if (options.length !== ids.length || new Set(options.map((option) => option.attributeId)).size !== options.length) {
    return null;
  }
  return ids;
}

function replaceOfferAttributes(offerId: number, optionIds: number[]) {
  directoryDb.prepare("DELETE FROM supplier_catalog_offer_attributes WHERE offer_id = ?").run(offerId);
  const insert = directoryDb.prepare(`
    INSERT INTO supplier_catalog_offer_attributes (offer_id, attribute_id, option_id)
    SELECT ?, attribute_id, id FROM supplier_catalog_item_attribute_options WHERE id = ?
  `);
  for (const optionId of optionIds) insert.run(offerId, optionId);
}

function catalogOfferVariantKey(optionIds: number[]) {
  return [...optionIds].sort((left, right) => left - right).join(",");
}

function getOfferAttributeOptionIds(offerId: number) {
  return (directoryDb.prepare(`
    SELECT option_id AS id FROM supplier_catalog_offer_attributes
    WHERE offer_id = ? ORDER BY option_id
  `).all(offerId) as Array<{ id: number }>).map(({ id }) => id);
}

router.get("/catalog/item-filters", (req, res): void => {
  const rawItemId = req.query.itemId;
  const itemId = rawItemId === undefined ? null : validId(rawItemId);
  const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
  if ((rawItemId !== undefined && (Array.isArray(rawItemId) || itemId === null))
    || (req.query.category !== undefined && typeof req.query.category !== "string")
    || (req.query.q !== undefined && typeof req.query.q !== "string")
    || (itemId !== null && (category || query))) {
    res.status(400).json({ error: "حدد صنفاً واحداً أو كلمة بحث/قسم صالحاً، وليس كليهما." });
    return;
  }

  let selectedIds: number[] | undefined;
  if (itemId !== null) selectedIds = [itemId];
  if (category) {
    const categoryIds = category === "لوز"
      ? getAlmondItemIds(directoryDb)
      : resolvePublicSupplierTaxonomySelection(category).itemIds;
    selectedIds = selectedIds === undefined
      ? categoryIds
      : selectedIds.filter((id) => categoryIds.includes(id));
  }
  if (query) {
    const queryIds = resolvePublicSupplierTaxonomySelection(query).itemIds;
    selectedIds = selectedIds === undefined
      ? queryIds
      : selectedIds.filter((id) => queryIds.includes(id));
  }
  const publicItems = listPublicSupplierTaxonomyItems();
  const publicIds = new Set(publicItems.map((item) => item.id));
  const itemTranslations = new Map((directoryDb.prepare(`
    SELECT id, name_en AS nameEn FROM supplier_taxonomy_items WHERE is_active = 1 AND name_en IS NOT NULL
  `).all() as Array<{ id: number; nameEn: string }>).map((item) => [item.id, item.nameEn]));
  const matchedItems = publicItems.filter((item) =>
    selectedIds === undefined || selectedIds.includes(item.id));
  if (itemId !== null && !publicIds.has(itemId)) {
    res.status(404).json({ error: "الصنف الرئيسي غير موجود أو غير متاح." });
    return;
  }
  res.json(matchedItems.map((item) => ({
    id: item.id,
    name: item.name,
    nameEn: itemTranslations.get(item.id) ?? null,
    ...itemConfiguration(item.id),
  })));
});

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
      o.is_active AS isActive, o.form_id AS formId, form.name_ar AS formNameAr,
      (${publicCatalogOfferEligibilitySql("o", "st", "i", "n")}) AS isPubliclyEligible
    FROM supplier_catalog_offers o
    JOIN supplier_catalog_subtypes st ON st.id = o.subtype_id
    JOIN supplier_taxonomy_items i ON i.id = st.item_id
    JOIN supplier_taxonomy_nodes n ON n.id = i.category_id
    LEFT JOIN supplier_catalog_item_forms form ON form.id = o.form_id
    WHERE o.id = ? AND o.supplier_id = ?
  `).get(id, supplierId);
  if (!row) return undefined;
  const offer = row as {
    id: number; subtypeId: number; itemId: number; subtypeNameAr: string;
    subtypeNameEn: string; subtypeStatus: string; price: number | null;
    lastUpdated: string; isActive: number; isPubliclyEligible: number;
    formId: number | null; formNameAr: string | null;
  };
  const attributeOptionIds = directoryDb.prepare(`
    SELECT option_id AS id FROM supplier_catalog_offer_attributes
    WHERE offer_id = ? ORDER BY attribute_id
  `).all(offer.id).map((value) => (value as { id: number }).id);
  return {
    id: offer.id,
    subtypeId: offer.subtypeId,
    price: offer.price,
    lastUpdated: offer.lastUpdated,
    isActive: Boolean(offer.isActive),
    eligibilityStatus: offer.isPubliclyEligible ? "eligible" : "pending",
    formId: offer.formId,
    formNameAr: offer.formNameAr,
    attributeOptionIds,
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
      o.form_id AS formId, selectedForm.name_ar AS formNameAr,
      st.status AS subtypeStatus,
      st.is_approved AS subtypeIsApproved,
      (${publicCatalogOfferEligibilitySql("o", "st", "i", "n")}) AS isPubliclyEligible
    FROM supplier_catalog_offers o
    JOIN supplier_catalog_subtypes st ON st.id = o.subtype_id
    JOIN supplier_taxonomy_items i ON i.id = st.item_id
    JOIN supplier_taxonomy_nodes n ON n.id = i.category_id
    LEFT JOIN supplier_catalog_item_forms selectedForm ON selectedForm.id = o.form_id
    WHERE o.supplier_id = ?
      AND EXISTS (SELECT 1 FROM active_item_nodes publicItem WHERE publicItem.itemId = st.item_id)
      AND ${publicTaxonomyNodeCondition("n")}
    ORDER BY o.id
  `).all(supplierId) as Array<{
    id: number; subtypeId: number; itemId: number; price: number | null;
    lastUpdated: string; isActive: number; formId: number | null; formNameAr: string | null; subtypeStatus: string;
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
    formId: offer.formId,
    formNameAr: offer.formNameAr,
    attributeOptionIds: directoryDb.prepare(`
      SELECT option_id AS id FROM supplier_catalog_offer_attributes
      WHERE offer_id = ? ORDER BY attribute_id
    `).all(offer.id).map((entry) => (entry as { id: number }).id),
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
      ...itemConfiguration(master.id),
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
  const formId = validId(req.body?.formId);
  const subtypeId = req.body?.subtypeId === undefined ? null : validId(req.body.subtypeId);
  const newSubtype = req.body?.newSubtype;
  const hasNewSubtype = newSubtype !== undefined;
  const price = req.body?.price === undefined ? null : req.body.price;
  if (!itemId || !formId || (req.body?.subtypeId !== undefined && !subtypeId)
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
  const form = directoryDb.prepare(`
    SELECT id FROM supplier_catalog_item_forms
    WHERE id = ? AND item_id = ? AND is_active = 1
  `).get(formId, itemId);
  if (!form) {
    res.status(400).json({ error: "الشكل المحدد لا يتبع الصنف أو غير متاح." });
    return;
  }
  const attributeOptionIds = validOptionsForItem(itemId, req.body?.attributeOptionIds);
  if (attributeOptionIds === null) {
    res.status(400).json({ error: "اختر قيمة واحدة صالحة فقط لكل سمة من سمات الصنف." });
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
    const variantKey = catalogOfferVariantKey(attributeOptionIds);
    const existingOffer = directoryDb.prepare(`
      SELECT id FROM supplier_catalog_offers
      WHERE supplier_id = ? AND subtype_id = ? AND form_id = ? AND variant_key = ?
      ORDER BY id LIMIT 1
    `).get(supplierId, selectedSubtypeId, formId, variantKey) as { id: number } | undefined;
    let offerId: number;
    if (existingOffer) {
      directoryDb.prepare(`
        UPDATE supplier_catalog_offers
        SET price = ?, form_id = ?, variant_key = ?, last_updated = ?, is_active = 1
        WHERE id = ? AND supplier_id = ?
      `).run(price, formId, variantKey, now, existingOffer.id, supplierId);
      offerId = existingOffer.id;
    } else {
      offerId = Number(directoryDb.prepare(`
        INSERT INTO supplier_catalog_offers
          (supplier_id, subtype_id, form_id, variant_key, price, last_updated, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(supplierId, selectedSubtypeId, formId, variantKey, price, now).lastInsertRowid);
    }
    replaceOfferAttributes(offerId, attributeOptionIds);
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
  const body = req.body as Record<string, unknown> | undefined;
  const hasPrice = Boolean(body && Object.hasOwn(body, "price"));
  const hasForm = Boolean(body && Object.hasOwn(body, "formId"));
  const hasAttributes = Boolean(body && Object.hasOwn(body, "attributeOptionIds"));
  if (!id || !body || (!hasPrice && !hasForm && !hasAttributes)
    || (hasPrice && !validPrice(body.price))) {
    res.status(400).json({ error: "أرسل سعراً صالحاً أو شكلاً أو قيماً صالحة للسمات." });
    return;
  }
  const offer = directoryDb.prepare(`
    SELECT o.id, st.item_id AS itemId
    FROM supplier_catalog_offers o
    JOIN supplier_catalog_subtypes st ON st.id = o.subtype_id
    WHERE o.id = ? AND o.supplier_id = ?
  `).get(id, supplierId) as { id: number; itemId: number } | undefined;
  if (!offer) {
    res.status(404).json({ error: "العرض غير موجود." });
    return;
  }
  let formId: number | undefined;
  if (hasForm) {
    formId = validId(body.formId) ?? undefined;
    if (!formId || !directoryDb.prepare(`
      SELECT id FROM supplier_catalog_item_forms WHERE id = ? AND item_id = ? AND is_active = 1
    `).get(formId, offer.itemId)) {
      res.status(400).json({ error: "الشكل المحدد لا يتبع الصنف أو غير متاح." });
      return;
    }
  }
  const attributeOptionIds = hasAttributes
    ? validOptionsForItem(offer.itemId, body.attributeOptionIds)
    : undefined;
  if (attributeOptionIds === null) {
    res.status(400).json({ error: "اختر قيمة واحدة صالحة فقط لكل سمة من سمات الصنف." });
    return;
  }
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN IMMEDIATE");
  try {
    const current = directoryDb.prepare(`
      SELECT price, form_id AS formId, subtype_id AS subtypeId
      FROM supplier_catalog_offers WHERE id = ? AND supplier_id = ?
    `).get(id, supplierId) as { price: number | null; formId: number | null; subtypeId: number };
    const nextFormId = formId ?? current.formId;
    if (!nextFormId) {
      directoryDb.exec("ROLLBACK");
      res.status(409).json({ error: "يجب تعيين شكل صالح لهذا العرض قبل تعديله." });
      return;
    }
    const nextOptionIds = attributeOptionIds ?? getOfferAttributeOptionIds(id);
    const variantKey = catalogOfferVariantKey(nextOptionIds);
    const collision = directoryDb.prepare(`
      SELECT id FROM supplier_catalog_offers
      WHERE supplier_id = ? AND subtype_id = ? AND form_id = ? AND variant_key = ?
        AND is_active = 1 AND id <> ?
      LIMIT 1
    `).get(supplierId, current.subtypeId, nextFormId, variantKey, id) as { id: number } | undefined;
    if (collision) {
      directoryDb.exec("ROLLBACK");
      res.status(409).json({
        error: "يوجد عرض نشط بهذا النوع والشكل ومجموعة السمات بالفعل.",
        conflictingOfferId: collision.id,
      });
      return;
    }
    directoryDb.prepare(`
      UPDATE supplier_catalog_offers
      SET price = ?, form_id = ?, variant_key = ?, last_updated = ?
      WHERE id = ? AND supplier_id = ?
    `).run(
      hasPrice ? body.price as number | null : current.price,
      nextFormId,
      variantKey,
      now,
      id,
      supplierId,
    );
    if (attributeOptionIds !== undefined) replaceOfferAttributes(id, attributeOptionIds);
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not update supplier catalog offer configuration");
    res.status(409).json({ error: "تعذر تحديث بيانات الشكل والسمات." });
    return;
  }
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
  const masters = masterRows.map((master) => ({
    ...master,
    isActive: Boolean(master.isActive),
    ...itemConfiguration(master.id, false),
  }));
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

router.post("/admin/catalog/masters/:id/forms", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const itemId = validId(req.params.id);
  const name = readNames(req.body);
  if (!itemId || !name) {
    res.status(400).json({ error: "أدخل اسمي الشكل بالعربية والإنجليزية." });
    return;
  }
  if (!directoryDb.prepare("SELECT id FROM supplier_taxonomy_items WHERE id = ?").get(itemId)) {
    res.status(404).json({ error: "الصنف الرئيسي غير موجود." });
    return;
  }
  const existing = directoryDb.prepare(`
    SELECT name_ar AS nameAr, name_en AS nameEn
    FROM supplier_catalog_item_forms WHERE item_id = ?
  `).all(itemId) as Array<{ nameAr: string; nameEn: string }>;
  if (isDuplicateName(existing, name)) {
    res.status(409).json({ error: "هذا الشكل موجود لهذا الصنف بالفعل." });
    return;
  }
  try {
    const result = directoryDb.prepare(`
      INSERT INTO supplier_catalog_item_forms (item_id, name_ar, name_en, created_at)
      VALUES (?, ?, ?, ?)
    `).run(itemId, name.nameAr, name.nameEn, new Date().toISOString());
    res.status(201).json({
      id: Number(result.lastInsertRowid), itemId,
      nameAr: name.nameAr, nameEn: name.nameEn, isActive: true,
    });
  } catch (error) {
    req.log.error({ err: error }, "Could not create catalog item form");
    res.status(409).json({ error: "تعذر إضافة الشكل لهذا الصنف." });
  }
});

router.post("/admin/catalog/masters/:id/attributes", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const itemId = validId(req.params.id);
  const name = readNames(req.body);
  const options = readNameList(req.body?.options);
  if (!itemId || !name || !options) {
    res.status(400).json({ error: "أدخل اسم السمة وقيمة واحدة صالحة على الأقل." });
    return;
  }
  if (!directoryDb.prepare("SELECT id FROM supplier_taxonomy_items WHERE id = ?").get(itemId)) {
    res.status(404).json({ error: "الصنف الرئيسي غير موجود." });
    return;
  }
  const existingAttributes = directoryDb.prepare(`
    SELECT name_ar AS nameAr, name_en AS nameEn
    FROM supplier_catalog_item_attributes WHERE item_id = ?
  `).all(itemId) as Array<{ nameAr: string; nameEn: string }>;
  if (isDuplicateName(existingAttributes, name)) {
    res.status(409).json({ error: "هذه السمة موجودة لهذا الصنف بالفعل." });
    return;
  }
  try {
    directoryDb.exec("BEGIN IMMEDIATE");
    const now = new Date().toISOString();
    const result = directoryDb.prepare(`
      INSERT INTO supplier_catalog_item_attributes (item_id, name_ar, name_en, created_at)
      VALUES (?, ?, ?, ?)
    `).run(itemId, name.nameAr, name.nameEn, now);
    const attributeId = Number(result.lastInsertRowid);
    const insertOption = directoryDb.prepare(`
      INSERT INTO supplier_catalog_item_attribute_options
        (attribute_id, name_ar, name_en, created_at) VALUES (?, ?, ?, ?)
    `);
    for (const option of options) {
      insertOption.run(attributeId, option.nameAr, option.nameEn, now);
    }
    directoryDb.exec("COMMIT");
    res.status(201).json(getItemAttributes(itemId, false).find((attribute) => attribute.id === attributeId));
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not create catalog item attribute");
    res.status(409).json({ error: "تعذر إضافة السمة أو إحدى قيمها المكررة." });
  }
});

router.post("/admin/catalog/attributes/:id/options", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const attributeId = validId(req.params.id);
  const options = readNameList(req.body?.options);
  if (!attributeId || !options) {
    res.status(400).json({ error: "أدخل قائمة قيم صالحة." });
    return;
  }
  const attribute = directoryDb.prepare(`
    SELECT id FROM supplier_catalog_item_attributes WHERE id = ?
  `).get(attributeId);
  if (!attribute) {
    res.status(404).json({ error: "السمة غير موجودة." });
    return;
  }
  const existing = directoryDb.prepare(`
    SELECT name_ar AS nameAr, name_en AS nameEn
    FROM supplier_catalog_item_attribute_options WHERE attribute_id = ?
  `).all(attributeId) as Array<{ nameAr: string; nameEn: string }>;
  if (options.some((option) => isDuplicateName(existing, option))) {
    res.status(409).json({ error: "إحدى هذه القيم موجودة لهذه السمة بالفعل." });
    return;
  }
  try {
    directoryDb.exec("BEGIN IMMEDIATE");
    const now = new Date().toISOString();
    const insert = directoryDb.prepare(`
      INSERT INTO supplier_catalog_item_attribute_options
        (attribute_id, name_ar, name_en, created_at) VALUES (?, ?, ?, ?)
    `);
    const ids = options.map((option) =>
      Number(insert.run(attributeId, option.nameAr, option.nameEn, now).lastInsertRowid));
    directoryDb.exec("COMMIT");
    res.status(201).json(ids.map((id, index) => ({
      id, attributeId, nameAr: options[index].nameAr, nameEn: options[index].nameEn, isActive: true,
    })));
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not create catalog attribute options");
    res.status(409).json({ error: "تعذر إضافة قيم السمة." });
  }
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
      categoryName: categoryName.name, isActive: true, ...itemConfiguration(id, false),
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