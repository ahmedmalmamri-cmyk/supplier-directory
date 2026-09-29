import { Router, type IRouter } from "express";
import {
  AddReviewBody,
  AddReviewParams,
  AddReviewResponse,
  FetchCategoryParams,
  FetchCategoryQueryParams,
  FetchCategoryResponse,
  GetHomeResponse,
  ListItemCategoriesResponse,
  GetProductParams,
  GetProductResponse,
  GetSupplierParams,
  GetSupplierResponse,
  ListSuppliersQueryParams,
  ListSuppliersResponse,
  SearchDirectoryQueryParams,
  SearchDirectoryResponse,
  RegisterInterestBody,
  RegisterInterestResponse,
  SendContactBody,
  SendContactResponse,
} from "@workspace/api-zod";
import { directoryDb, refreshSupplierRatings } from "../lib/directory-db";
import { buildPublicAlmondSupplierFilter, getAlmondItemIds } from "../lib/almond-variants";
import { getBuyerIdFromRequest } from "../lib/buyer-auth";
import { getSupplierIdFromRequest } from "../lib/supplier-auth";
import { recordSupplierStat } from "../lib/supplier-stats";
import { getTestModeSession, isTestModeRequest, isTestModeAccount } from "../lib/test-mode";
import { publicCatalogOfferEligibilitySql, publicCatalogVisibilitySql } from "../lib/catalog-visibility";
import {
  listPublicSupplierTaxonomyItems,
  resolvePublicSupplierTaxonomySelection,
} from "../lib/public-supplier-taxonomy";

const router: IRouter = Router();

const supplierSelect = `
  SELECT s.id, s.name, s.city, s.region, s.description,
    CASE WHEN length(trim(s.whatsapp)) > 0 THEN 1 ELSE 0 END AS hasWhatsApp,
    NULL AS address, NULL AS website, s.google_category AS googleCategory,
    s.google_rating AS googleRating, s.google_review_count AS googleReviewCount,
    s.hours_note AS hoursNote,
    CAST(s.is_verified AS INTEGER) AS isVerified, s.average_rating AS averageRating,
    s.created_at AS createdAt, s.request_id AS requestId, s.is_active AS isActive,
    s.is_featured AS isFeatured,
    COUNT(DISTINCT p.id) AS productCount
  FROM suppliers s LEFT JOIN products p ON p.supplier_id = s.id
`;
const productSelect = `
  SELECT p.id, p.supplier_id AS supplierId, s.name AS supplierName,
    p.category_id AS categoryId, c.name AS categoryName, p.name, p.weight, p.unit,
    p.country_of_origin AS countryOfOrigin, p.min_order AS minOrder,
     p.image_url AS imageUrl, p.sort_order AS sortOrder, p.created_at AS createdAt
  FROM products p
  JOIN suppliers s ON s.id = p.supplier_id AND s.is_active = 1
    AND ${publicCatalogVisibilitySql("s")}
  JOIN categories c ON c.id = p.category_id
`;
const normalizeSuppliers = (rows: Record<string, unknown>[]) =>
  rows.map((row) => ({ ...row, isVerified: Boolean(row.isVerified), isFeatured: Boolean(row.isFeatured), hasWhatsApp: Boolean(row.hasWhatsApp) }));

function almondVariantFormForItem(itemName: string | undefined): "whole" | "slices" | "powder" | undefined {
  if (itemName === "لوز حب") return "whole";
  if (itemName === "لوز شرائح") return "slices";
  if (itemName === "لوز مطحون") return "powder";
  return undefined;
}

function attachPublicOfferedSubtypes<T extends Record<string, unknown>>(suppliers: T[]) {
  if (!suppliers.length) return suppliers.map((supplier) => ({ ...supplier, offeredSubtypes: [] }));
  const ids = suppliers.map((supplier) => Number(supplier.id));
  const offers = directoryDb.prepare(`
    SELECT catalogOffer.supplier_id AS supplierId, catalogOffer.id AS offerId,
      catalogSubtype.id, catalogSubtype.item_id AS itemId,
      catalogSubtype.name_ar AS nameAr, catalogSubtype.name_en AS nameEn,
      catalogItem.name AS itemName, catalogItem.name_en AS itemNameEn,
      catalogOffer.price, catalogOffer.last_updated AS lastUpdated,
      catalogOffer.form_id AS formId, catalogForm.name_ar AS formNameAr
    FROM supplier_catalog_offers catalogOffer
    JOIN supplier_catalog_subtypes catalogSubtype
      ON catalogSubtype.id = catalogOffer.subtype_id
    JOIN supplier_taxonomy_items catalogItem
      ON catalogItem.id = catalogSubtype.item_id AND catalogItem.is_active = 1
    JOIN supplier_taxonomy_nodes catalogNode
      ON catalogNode.id = catalogItem.category_id AND catalogNode.is_active = 1
    LEFT JOIN supplier_catalog_item_forms catalogForm ON catalogForm.id = catalogOffer.form_id
    WHERE ${publicCatalogOfferEligibilitySql()}
      AND catalogOffer.supplier_id IN (${ids.map(() => "?").join(", ")})
    ORDER BY catalogItem.name, catalogSubtype.name_ar, catalogSubtype.id
  `).all(...ids) as Array<Record<string, unknown> & { supplierId: number; offerId: number }>;
  const offerIds = offers.map((offer) => offer.offerId);
  const offerAttributes = offerIds.length ? directoryDb.prepare(`
    SELECT selected.offer_id AS offerId, option.id, attribute.id AS attributeId,
      attribute.name_ar AS attributeNameAr, option.name_ar AS optionNameAr,
      option.name_en AS optionNameEn
    FROM supplier_catalog_offer_attributes selected
    JOIN supplier_catalog_item_attribute_options option
      ON option.id = selected.option_id AND option.is_active = 1
    JOIN supplier_catalog_item_attributes attribute
      ON attribute.id = selected.attribute_id AND attribute.is_active = 1
    WHERE selected.offer_id IN (${offerIds.map(() => "?").join(", ")})
    ORDER BY attribute.id, option.id
  `).all(...offerIds) as Array<Record<string, unknown> & { offerId: number }>
    : [];
  const attributesByOffer = new Map<number, Array<Record<string, unknown>>>();
  for (const selected of offerAttributes) {
    const { offerId, ...attribute } = selected;
    const entries = attributesByOffer.get(offerId) ?? [];
    entries.push(attribute);
    attributesByOffer.set(offerId, entries);
  }
  const bySupplier = new Map<number, Array<Record<string, unknown>>>();
  for (const offer of offers) {
    const { supplierId, ...offeredSubtype } = offer;
    const entries = bySupplier.get(supplierId) ?? [];
    entries.push({
      ...offeredSubtype,
      attributeOptions: attributesByOffer.get(offer.offerId) ?? [],
    });
    bySupplier.set(supplierId, entries);
  }
  return suppliers.map((supplier) => ({
    ...supplier,
    offeredSubtypes: bySupplier.get(Number(supplier.id)) ?? [],
  }));
}

function withVisibility<T extends Record<string, unknown>>(rows: T[]) {
  return attachPublicOfferedSubtypes(rows);
}

const normalizePlans = (rows: Record<string, unknown>[]) =>
  rows.map((row) => ({
    ...row,
    hasVerifiedBadge: Boolean(row.hasVerifiedBadge),
    hasFeaturedListing: Boolean(row.hasFeaturedListing),
    hasBanner: Boolean(row.hasBanner),
    hasAnalytics: Boolean(row.hasAnalytics),
    hasPrioritySupport: Boolean(row.hasPrioritySupport),
    isActive: Boolean(row.isActive),
  }));

router.get("/contact-settings", (_req, res): void => {
  const rows = directoryDb.prepare(`
    SELECT key, value FROM directory_settings
    WHERE key IN ('admin_whatsapp', 'admin_email', 'admin_address')
  `).all() as Array<{ key: string; value: string }>;
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  res.json({
    whatsapp: settings.admin_whatsapp || "0566866805",
    email: settings.admin_email || "ahmed.m.almamri@gmail.com",
    address: settings.admin_address || "الدمام، المنطقة الشرقية\nالمملكة العربية السعودية",
  });
});

router.get("/plans", (_req, res): void => {
  const plans = directoryDb.prepare(`
    SELECT id, name, slug, price_monthly AS priceMonthly, max_products AS maxProducts,
      max_images_per_product AS maxImagesPerProduct, has_verified_badge AS hasVerifiedBadge,
      has_featured_listing AS hasFeaturedListing, has_banner AS hasBanner,
      has_analytics AS hasAnalytics, has_priority_support AS hasPrioritySupport,
      description, is_active AS isActive, display_order AS displayOrder
    FROM plans WHERE is_active = 1 ORDER BY display_order, id
  `).all() as Record<string, unknown>[];
  res.json(normalizePlans(plans));
});
router.get("/home", (_req, res): void => {
  const categories = directoryDb.prepare(`
    SELECT c.id, c.name, c.icon, c.slug, COUNT(categorySupplier.id) AS productCount
    FROM categories c LEFT JOIN products p ON p.category_id = c.id
    LEFT JOIN suppliers categorySupplier ON categorySupplier.id = p.supplier_id
      AND categorySupplier.is_active = 1 AND ${publicCatalogVisibilitySql("categorySupplier")}
    GROUP BY c.id ORDER BY c.id
  `).all();
  const featuredSuppliers = withVisibility(normalizeSuppliers(directoryDb.prepare(`
    ${supplierSelect} WHERE s.is_active = 1 AND ${publicCatalogVisibilitySql("s")}
    GROUP BY s.id ORDER BY s.is_featured DESC, s.is_verified DESC, s.average_rating DESC LIMIT 6
  `).all() as Record<string, unknown>[]));
  const latestProducts = directoryDb.prepare(`
    ${productSelect} ORDER BY p.created_at DESC, p.id DESC LIMIT 9
  `).all();
  const stats = directoryDb.prepare(`
    SELECT
      (SELECT COUNT(*) FROM suppliers s WHERE s.is_active = 1 AND ${publicCatalogVisibilitySql("s")}) AS suppliers,
      (SELECT COUNT(*) FROM products p JOIN suppliers s ON s.id = p.supplier_id AND s.is_active = 1
        WHERE ${publicCatalogVisibilitySql("s")}) AS products,
      (SELECT COUNT(DISTINCT s.city) FROM suppliers s WHERE s.is_active = 1
        AND s.city != 'غير محدد' AND ${publicCatalogVisibilitySql("s")}) AS cities,
      (SELECT COUNT(*) FROM reviews r JOIN suppliers s ON s.id = r.supplier_id
        WHERE s.is_active = 1 AND ${publicCatalogVisibilitySql("s")}) AS reviews
  `).get();
  const home = GetHomeResponse.parse({ categories, featuredSuppliers, latestProducts, stats });
  res.json(home);
});

router.get("/item-categories", (_req, res): void => {
  const categories = listPublicSupplierTaxonomyItems();
  res.json(ListItemCategoriesResponse.parse(categories));
});

router.get("/search", (req, res): void => {
  const parsed = SearchDirectoryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const searchTerm = (parsed.data.q ?? "").trim().slice(0, 120);
  const buyerId = getSupplierIdFromRequest(req) ? null : getBuyerIdFromRequest(req);
  if (searchTerm && buyerId && !getTestModeSession(req)) {
    directoryDb.prepare(`
      INSERT INTO buyer_search_logs (search_term, searched_at, buyer_id) VALUES (?, ?, ?)
    `).run(searchTerm, new Date().toISOString(), buyerId);
  }
  const term = `%${parsed.data.q ?? ""}%`;
  const suppliers = withVisibility(normalizeSuppliers(directoryDb.prepare(`
    ${supplierSelect} WHERE s.is_active = 1 AND ${publicCatalogVisibilitySql("s")} AND (
      s.name LIKE ? OR s.description LIKE ? OR s.city LIKE ?
      OR EXISTS (
        SELECT 1 FROM supplier_requests sr
        WHERE sr.id = s.request_id AND (sr.categories LIKE ? OR sr.business_type LIKE ?)
      )
      OR EXISTS (
        SELECT 1 FROM products sp
        JOIN categories sc ON sc.id = sp.category_id
        WHERE sp.supplier_id = s.id
          AND (sp.name LIKE ? OR sp.country_of_origin LIKE ? OR sc.name LIKE ?)
      )
      OR EXISTS (
        SELECT 1
        FROM supplier_catalog_offers catalogOffer
        JOIN supplier_catalog_subtypes catalogSubtype
          ON catalogSubtype.id = catalogOffer.subtype_id
        JOIN supplier_taxonomy_items catalogItem
          ON catalogItem.id = catalogSubtype.item_id AND catalogItem.is_active = 1
        JOIN supplier_taxonomy_nodes catalogNode
          ON catalogNode.id = catalogItem.category_id AND catalogNode.is_active = 1
        WHERE catalogOffer.supplier_id = s.id
          AND ${publicCatalogOfferEligibilitySql()}
          AND (lower(catalogSubtype.name_ar) LIKE lower(?) OR lower(catalogSubtype.name_en) LIKE lower(?)
            OR lower(catalogItem.name) LIKE lower(?) OR lower(COALESCE(catalogItem.name_en, '')) LIKE lower(?))
      )
    )
    GROUP BY s.id ORDER BY s.average_rating DESC
  `).all(term, term, term, term, term, term, term, term, term, term, term, term) as Record<string, unknown>[]));
  const products = directoryDb.prepare(`
    ${productSelect}
    WHERE p.name LIKE ? OR s.name LIKE ? OR p.country_of_origin LIKE ? OR c.name LIKE ?
    ORDER BY p.created_at DESC
  `).all(term, term, term, term);
  res.json(SearchDirectoryResponse.parse({ suppliers, products }));
});

router.get("/categories/:id", (req, res): void => {
  const params = FetchCategoryParams.safeParse(req.params);
  const query = FetchCategoryQueryParams.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({ error: "بيانات الفلترة غير صالحة" });
    return;
  }
  const category = directoryDb.prepare(`
    SELECT c.id, c.name, c.icon, c.slug, COUNT(categorySupplier.id) AS productCount
    FROM categories c LEFT JOIN products p ON p.category_id = c.id
    LEFT JOIN suppliers categorySupplier ON categorySupplier.id = p.supplier_id
      AND categorySupplier.is_active = 1 AND ${publicCatalogVisibilitySql("categorySupplier")}
    WHERE c.id = ? GROUP BY c.id
  `).get(params.data.id);
  if (!category) {
    res.status(404).json({ error: "التصنيف غير موجود" });
    return;
  }
  const { city, rating, minOrder, sort = "newest" } = query.data;
  const order = sort === "rating"
    ? "s.average_rating DESC"
    : sort === "alphabetical" ? "p.name ASC" : "p.created_at DESC";
  const values: (string | number)[] = [params.data.id];
  let filters = `WHERE p.category_id = ? AND s.is_active = 1 AND ${publicCatalogVisibilitySql("s")}`;
  if (city) { filters += " AND s.city = ?"; values.push(city); }
  if (rating) { filters += " AND s.average_rating >= ?"; values.push(rating); }
  if (minOrder) { filters += " AND p.min_order <= ?"; values.push(minOrder); }
  const products = directoryDb.prepare(`
    ${productSelect} ${filters} ORDER BY ${order}
  `).all(...values);
  const suppliers = withVisibility(normalizeSuppliers(directoryDb.prepare(`
    ${supplierSelect}
    JOIN products cp ON cp.supplier_id = s.id
    WHERE cp.category_id = ? AND s.is_active = 1 AND ${publicCatalogVisibilitySql("s")}
    ${city ? "AND s.city = ?" : ""}
    ${rating ? "AND s.average_rating >= ?" : ""}
    GROUP BY s.id ORDER BY s.average_rating DESC
  `).all(
    params.data.id,
    ...([city, rating].filter((value) => value !== undefined) as (string | number)[]),
  ) as Record<string, unknown>[]));
  const cities = directoryDb.prepare(`
    SELECT DISTINCT s.city FROM suppliers s
    JOIN products p ON p.supplier_id = s.id
    WHERE p.category_id = ? AND s.is_active = 1 AND ${publicCatalogVisibilitySql("s")} ORDER BY s.city
  `).all(params.data.id).map((row) => (row as { city: string }).city);
  res.json(FetchCategoryResponse.parse({ category, products, suppliers, cities }));
});

router.get("/suppliers", (req, res): void => {
  const queryForValidation = { ...req.query };
  if (typeof req.query.attributeOptionIds === "string") {
    queryForValidation.attributeOptionIds = [req.query.attributeOptionIds];
  }
  const parsed = ListSuppliersQueryParams.safeParse(queryForValidation);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const {
    q, city, type, category, variantForm, variantPreparation, variantSize,
    rating, package: supplierPackage, verified, sort = "rating",
  } = parsed.data;
  const rawSubtypeId = req.query.subtypeId;
  let subtypeId: number | undefined;
  if (rawSubtypeId !== undefined) {
    if (Array.isArray(rawSubtypeId) || typeof rawSubtypeId !== "string" || !/^[1-9]\d*$/.test(rawSubtypeId)) {
      res.status(400).json({ error: "معرّف النوع الفرعي غير صالح." });
      return;
    }
    subtypeId = Number(rawSubtypeId);
  }
  const rawFormId = req.query.formId;
  let formId: number | undefined;
  if (rawFormId !== undefined) {
    if (Array.isArray(rawFormId) || typeof rawFormId !== "string" || !/^[1-9]\d*$/.test(rawFormId)) {
      res.status(400).json({ error: "معرّف الشكل غير صالح." });
      return;
    }
    formId = Number(rawFormId);
  }
  const rawAttributeOptionIds = req.query.attributeOptionIds;
  const rawOptionValues = rawAttributeOptionIds === undefined
    ? []
    : Array.isArray(rawAttributeOptionIds) ? rawAttributeOptionIds : [rawAttributeOptionIds];
  if (rawOptionValues.length > 20 || rawOptionValues.some((value) =>
    typeof value !== "string" || !/^[1-9]\d*$/.test(value))) {
    res.status(400).json({ error: "قيم السمات المحددة غير صالحة." });
    return;
  }
  const attributeOptionIds = [...new Set(rawOptionValues.map(Number))];
  if (attributeOptionIds.length !== rawOptionValues.length) {
    res.status(400).json({ error: "لا تكرر قيم السمات." });
    return;
  }
  let filterItemId: number | undefined;
  let dynamicCategoryItemIds: number[] | undefined;
  let dynamicQueryItemIds: number[] | undefined;
  let dynamicAlmondVariantForm: "whole" | "slices" | "powder" | undefined;
  if (formId !== undefined || attributeOptionIds.length) {
    const form = formId === undefined ? undefined : directoryDb.prepare(`
      SELECT id, item_id AS itemId FROM supplier_catalog_item_forms
      WHERE id = ? AND is_active = 1
    `).get(formId) as { id: number; itemId: number } | undefined;
    if (formId !== undefined && !form) {
      res.status(400).json({ error: "الشكل المحدد غير متاح." });
      return;
    }
    const options = attributeOptionIds.length
      ? directoryDb.prepare(`
          SELECT option.id, attribute.item_id AS itemId
          FROM supplier_catalog_item_attribute_options option
          JOIN supplier_catalog_item_attributes attribute
            ON attribute.id = option.attribute_id AND attribute.is_active = 1
          WHERE option.is_active = 1 AND option.id IN (${attributeOptionIds.map(() => "?").join(", ")})
        `).all(...attributeOptionIds) as Array<{ id: number; itemId: number }>
      : [];
    const optionItems = new Set(options.map((option) => option.itemId));
    if (options.length !== attributeOptionIds.length || optionItems.size > 1) {
      res.status(400).json({ error: "قيم السمات يجب أن تتبع صنفاً رئيسياً واحداً ومتاحاً." });
      return;
    }
    filterItemId = form?.itemId ?? [...optionItems][0];
    if (category === "لوز" && form && filterItemId !== undefined) {
      const item = directoryDb.prepare("SELECT name FROM supplier_taxonomy_items WHERE id = ?")
        .get(filterItemId) as { name: string } | undefined;
      dynamicAlmondVariantForm = almondVariantFormForItem(item?.name);
    }
    if (form && optionItems.size && !optionItems.has(form.itemId)) {
      res.status(400).json({ error: "الشكل وقيم السمات المحددة لا تتبع الصنف نفسه." });
      return;
    }
    if (filterItemId !== undefined && category) {
      const categorySelection = category === "لوز"
        ? { known: true, itemIds: getAlmondItemIds(directoryDb) }
        : resolvePublicSupplierTaxonomySelection(category);
      if (categorySelection.known || categorySelection.itemIds.length) {
        dynamicCategoryItemIds = categorySelection.itemIds;
      }
    }
    if (filterItemId !== undefined && q) {
      const querySelection = resolvePublicSupplierTaxonomySelection(q);
      if (querySelection.itemIds.length) dynamicQueryItemIds = querySelection.itemIds;
    }
  }
  const hasAlmondVariantFilter = variantForm !== undefined || variantPreparation !== undefined || variantSize !== undefined;
  if (hasAlmondVariantFilter && category !== "لوز") {
    res.status(400).json({ error: "فلاتر أصناف اللوز تتطلب تحديد category=لوز." });
    return;
  }
  if (variantForm !== undefined && dynamicAlmondVariantForm && variantForm !== dynamicAlmondVariantForm) {
    res.status(400).json({ error: "شكل اللوز الديناميكي لا يطابق variantForm المحدد." });
    return;
  }
  if (variantSize !== undefined && variantForm !== "whole" && dynamicAlmondVariantForm !== "whole") {
    res.status(400).json({ error: "يُستخدم المقاس فقط مع شكل اللوز الكامل." });
    return;
  }
  const values: (string | number)[] = [];
  const clauses: string[] = [`s.is_active = 1`, publicCatalogVisibilitySql("s")];
  if (q) {
    const pattern = `%${q}%`;
    clauses.push(`(
      lower(s.name) LIKE lower(?) OR lower(s.description) LIKE lower(?) OR lower(s.city) LIKE lower(?)
      OR EXISTS (
        SELECT 1 FROM supplier_requests sr
        WHERE sr.id = s.request_id AND (lower(sr.categories) LIKE lower(?) OR lower(sr.business_type) LIKE lower(?))
      )
      OR EXISTS (
        SELECT 1 FROM products qp
        JOIN categories qc ON qc.id = qp.category_id
        WHERE qp.supplier_id = s.id
          AND (lower(qp.name) LIKE lower(?) OR lower(qp.country_of_origin) LIKE lower(?) OR lower(qc.name) LIKE lower(?))
      )
      OR EXISTS (
        SELECT 1 FROM supplier_catalog_offers catalogOffer
        JOIN supplier_catalog_subtypes catalogSubtype ON catalogSubtype.id = catalogOffer.subtype_id
        JOIN supplier_taxonomy_items catalogItem
          ON catalogItem.id = catalogSubtype.item_id AND catalogItem.is_active = 1
        JOIN supplier_taxonomy_nodes catalogNode
          ON catalogNode.id = catalogItem.category_id AND catalogNode.is_active = 1
        WHERE catalogOffer.supplier_id = s.id
          AND ${publicCatalogOfferEligibilitySql()}
          AND (lower(catalogSubtype.name_ar) LIKE lower(?) OR lower(catalogSubtype.name_en) LIKE lower(?)
            OR lower(catalogItem.name) LIKE lower(?) OR lower(COALESCE(catalogItem.name_en, '')) LIKE lower(?)
            OR lower(catalogNode.name) LIKE lower(?))
      )
    )`);
    values.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern);
  }
  if (subtypeId !== undefined) {
    clauses.push(`EXISTS (
      SELECT 1 FROM supplier_catalog_offers exactOffer
      JOIN supplier_catalog_subtypes exactSubtype ON exactSubtype.id = exactOffer.subtype_id
      JOIN supplier_taxonomy_items exactItem
        ON exactItem.id = exactSubtype.item_id AND exactItem.is_active = 1
      JOIN supplier_taxonomy_nodes exactNode
        ON exactNode.id = exactItem.category_id AND exactNode.is_active = 1
      WHERE exactOffer.supplier_id = s.id
        AND ${publicCatalogOfferEligibilitySql("exactOffer", "exactSubtype", "exactItem", "exactNode")}
        AND exactSubtype.id = ?
    )`);
    values.push(subtypeId);
  }
  if (formId !== undefined || attributeOptionIds.length) {
    clauses.push(`EXISTS (
      SELECT 1 FROM supplier_catalog_offers configuredOffer
      JOIN supplier_catalog_subtypes configuredSubtype ON configuredSubtype.id = configuredOffer.subtype_id
      JOIN supplier_taxonomy_items configuredItem
        ON configuredItem.id = configuredSubtype.item_id AND configuredItem.is_active = 1
      JOIN supplier_taxonomy_nodes configuredNode
        ON configuredNode.id = configuredItem.category_id AND configuredNode.is_active = 1
      WHERE configuredOffer.supplier_id = s.id
        AND ${publicCatalogOfferEligibilitySql("configuredOffer", "configuredSubtype", "configuredItem", "configuredNode")}
        ${formId !== undefined ? "AND configuredOffer.form_id = ?" : ""}
        ${filterItemId !== undefined ? "AND configuredItem.id = ?" : ""}
        ${subtypeId !== undefined ? "AND configuredSubtype.id = ?" : ""}
        ${dynamicCategoryItemIds !== undefined
          ? dynamicCategoryItemIds.length
            ? `AND configuredItem.id IN (${dynamicCategoryItemIds.map(() => "?").join(", ")})`
            : "AND 0"
          : ""}
        ${dynamicQueryItemIds !== undefined
          ? dynamicQueryItemIds.length
            ? `AND configuredItem.id IN (${dynamicQueryItemIds.map(() => "?").join(", ")})`
            : "AND 0"
          : ""}
        ${attributeOptionIds.length ? `AND (
          SELECT COUNT(DISTINCT configuredOfferAttribute.option_id)
          FROM supplier_catalog_offer_attributes configuredOfferAttribute
          JOIN supplier_catalog_item_attribute_options configuredOption
            ON configuredOption.id = configuredOfferAttribute.option_id AND configuredOption.is_active = 1
          JOIN supplier_catalog_item_attributes configuredAttribute
            ON configuredAttribute.id = configuredOfferAttribute.attribute_id
              AND configuredAttribute.is_active = 1
              AND configuredAttribute.item_id = configuredItem.id
          WHERE configuredOfferAttribute.offer_id = configuredOffer.id
            AND configuredOfferAttribute.option_id IN (${attributeOptionIds.map(() => "?").join(", ")})
        ) = ?` : ""}
        ${type ? `AND (
          lower(configuredSubtype.name_ar) LIKE lower(?) OR lower(configuredSubtype.name_en) LIKE lower(?)
          OR lower(configuredItem.name) LIKE lower(?) OR lower(COALESCE(configuredItem.name_en, '')) LIKE lower(?)
          OR lower(configuredNode.name) LIKE lower(?)
        )` : ""}
        ${q ? `AND (
          lower(s.name) LIKE lower(?) OR lower(s.description) LIKE lower(?) OR lower(s.city) LIKE lower(?)
          OR EXISTS (
            SELECT 1 FROM supplier_requests queryRequest
            WHERE queryRequest.id = s.request_id
              AND (lower(queryRequest.categories) LIKE lower(?) OR lower(queryRequest.business_type) LIKE lower(?))
          )
          OR EXISTS (
            SELECT 1 FROM products queryProduct
            JOIN categories queryCategory ON queryCategory.id = queryProduct.category_id
            WHERE queryProduct.supplier_id = s.id
              AND (lower(queryProduct.name) LIKE lower(?) OR lower(queryProduct.country_of_origin) LIKE lower(?)
                OR lower(queryCategory.name) LIKE lower(?))
          )
          OR (
            lower(configuredSubtype.name_ar) LIKE lower(?) OR lower(configuredSubtype.name_en) LIKE lower(?)
            OR lower(configuredItem.name) LIKE lower(?) OR lower(COALESCE(configuredItem.name_en, '')) LIKE lower(?)
            OR lower(configuredNode.name) LIKE lower(?)
          )
        )` : ""}
    )`);
    if (formId !== undefined) values.push(formId);
    if (filterItemId !== undefined) values.push(filterItemId);
    if (subtypeId !== undefined) values.push(subtypeId);
    if (dynamicCategoryItemIds?.length) values.push(...dynamicCategoryItemIds);
    if (dynamicQueryItemIds?.length) values.push(...dynamicQueryItemIds);
    if (attributeOptionIds.length) values.push(...attributeOptionIds, attributeOptionIds.length);
    if (type) {
      const pattern = `%${type}%`;
      values.push(pattern, pattern, pattern, pattern, pattern);
    }
    if (q) {
      const pattern = `%${q}%`;
      values.push(...Array.from({ length: 13 }, () => pattern));
    }
  }
  if (city) { clauses.push("s.city = ?"); values.push(city); }
  if (category) {
    if (category === "لوز") {
      const almondItemIds = getAlmondItemIds(directoryDb);
      const effectiveAlmondForm = variantForm ?? (
        variantPreparation !== undefined || variantSize !== undefined
          ? dynamicAlmondVariantForm
          : undefined
      );
      const requestedAlmondItemIds = effectiveAlmondForm === undefined
        ? almondItemIds
        : (directoryDb.prepare(`
            SELECT id FROM supplier_taxonomy_items
            WHERE id IN (${almondItemIds.map(() => "?").join(", ")})
              AND lower(trim(name)) = lower(?)
          `).all(
            ...almondItemIds,
            effectiveAlmondForm === "whole" ? "لوز حب"
              : effectiveAlmondForm === "slices" ? "لوز شرائح" : "لوز مطحون",
          ) as Array<{ id: number }>).map(({ id }) => id);
      const almondFilter = hasAlmondVariantFilter
        ? buildPublicAlmondSupplierFilter(
            almondItemIds,
            { form: effectiveAlmondForm, preparation: variantPreparation, size: variantSize },
          )
        : undefined;
      const offeredAlmonds = requestedAlmondItemIds.length ? `
        EXISTS (
          SELECT 1 FROM supplier_catalog_offers almondOffer
          JOIN supplier_catalog_subtypes almondSubtype ON almondSubtype.id = almondOffer.subtype_id
          JOIN supplier_taxonomy_items almondItem
            ON almondItem.id = almondSubtype.item_id
          JOIN supplier_taxonomy_nodes almondNode
            ON almondNode.id = almondItem.category_id
          WHERE almondOffer.supplier_id = s.id
            AND ${publicCatalogOfferEligibilitySql("almondOffer", "almondSubtype", "almondItem", "almondNode")}
            AND almondItem.id IN (${requestedAlmondItemIds.map(() => "?").join(", ")})
        )
      ` : "0";
      clauses.push(almondFilter
        ? `(${offeredAlmonds} AND (${almondFilter.sql}))`
        : offeredAlmonds);
      values.push(...requestedAlmondItemIds);
      if (almondFilter) values.push(...almondFilter.params);
    } else {
      const selection = resolvePublicSupplierTaxonomySelection(category);
      if (selection.itemIds.length) {
        const itemPlaceholders = selection.itemIds.map(() => "?").join(", ");
        clauses.push(`
          EXISTS (
            SELECT 1 FROM supplier_catalog_offers categoryOffer
            JOIN supplier_catalog_subtypes categorySubtype ON categorySubtype.id = categoryOffer.subtype_id
            JOIN supplier_taxonomy_items categoryItem ON categoryItem.id = categorySubtype.item_id
            JOIN supplier_taxonomy_nodes categoryNode ON categoryNode.id = categoryItem.category_id
            WHERE categoryOffer.supplier_id = s.id
              AND ${publicCatalogOfferEligibilitySql("categoryOffer", "categorySubtype", "categoryItem", "categoryNode")}
              AND categoryItem.id IN (${itemPlaceholders})
          )
        `);
        values.push(...selection.itemIds);
      } else if (selection.known) {
        clauses.push("0");
      } else {
        const categoryTerms = ({
          "زبدة ودهون": ["زبدة ودهون", "دهون وزبدة", "زبدة"],
          "شوكولاتة وكاكاو": ["شوكولاتة وكاكاو", "شوكولاتة", "كاكاو"],
          "علب وتغليف": ["علب وتغليف", "عبوات وتغليف"],
          "تغليف وعلب": ["علب وتغليف", "عبوات وتغليف", "أكياس مطبوعة", "كراتين مطبوعة"],
          "معدات وأفران": ["معدات وأفران", "معدات وأدوات"],
          "أدوات صغيرة": ["أدوات صغيرة", "معدات وأدوات"],
          "معدات وأدوات": ["معدات وأفران", "أدوات صغيرة", "معدات وأدوات"],
        } as Record<string, string[]>)[category] ?? [category];
        const patterns = categoryTerms.map((term) => `%${term}%`);
        const offerPatterns = patterns.map(() => `(
          lower(categorySubtype.name_ar) LIKE lower(?) OR lower(categorySubtype.name_en) LIKE lower(?)
          OR lower(categoryItem.name) LIKE lower(?) OR lower(COALESCE(categoryItem.name_en, '')) LIKE lower(?)
          OR lower(categoryNode.name) LIKE lower(?)
        )`).join(" OR ");
        clauses.push(`
          EXISTS (
            SELECT 1 FROM supplier_catalog_offers categoryOffer
            JOIN supplier_catalog_subtypes categorySubtype ON categorySubtype.id = categoryOffer.subtype_id
            JOIN supplier_taxonomy_items categoryItem ON categoryItem.id = categorySubtype.item_id
            JOIN supplier_taxonomy_nodes categoryNode ON categoryNode.id = categoryItem.category_id
            WHERE categoryOffer.supplier_id = s.id
              AND ${publicCatalogOfferEligibilitySql("categoryOffer", "categorySubtype", "categoryItem", "categoryNode")}
              AND (${offerPatterns})
          )
        `);
        values.push(...patterns.flatMap((pattern) => [pattern, pattern, pattern, pattern, pattern]));
      }
    }
  }
  if (type) {
    const pattern = `%${type}%`;
    clauses.push(`
      EXISTS (
        SELECT 1 FROM supplier_catalog_offers typeOffer
        JOIN supplier_catalog_subtypes typeSubtype ON typeSubtype.id = typeOffer.subtype_id
        JOIN supplier_taxonomy_items typeItem ON typeItem.id = typeSubtype.item_id
        JOIN supplier_taxonomy_nodes typeNode ON typeNode.id = typeItem.category_id
        WHERE typeOffer.supplier_id = s.id
          AND ${publicCatalogOfferEligibilitySql("typeOffer", "typeSubtype", "typeItem", "typeNode")}
          AND (lower(typeSubtype.name_ar) LIKE lower(?) OR lower(typeSubtype.name_en) LIKE lower(?)
            OR lower(typeItem.name) LIKE lower(?) OR lower(COALESCE(typeItem.name_en, '')) LIKE lower(?)
            OR lower(typeNode.name) LIKE lower(?))
      )
    `);
    values.push(pattern, pattern, pattern, pattern, pattern);
  }
  if (rating !== undefined) { clauses.push("s.average_rating >= ?"); values.push(rating); }
  if (supplierPackage === "verified") { clauses.push("s.is_verified = 1"); }
  if (supplierPackage === "featured") { clauses.push("s.is_featured = 1"); }
  if (verified !== undefined) { clauses.push("s.is_verified = ?"); values.push(verified ? 1 : 0); }
  const order = sort === "newest"
    ? "s.created_at DESC"
    : sort === "alphabetical" ? "s.name ASC" : "s.average_rating DESC";
  const rows = withVisibility(normalizeSuppliers(directoryDb.prepare(`
    ${supplierSelect}
    WHERE ${clauses.join(" AND ")}
    GROUP BY s.id ORDER BY ${order}
  `).all(...values) as Record<string, unknown>[]));
  const response = ListSuppliersResponse.parse(rows);
  res.json(response);
});

router.get("/suppliers/:id", (req, res): void => {
  const parsed = GetSupplierParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const supplierRows = withVisibility(normalizeSuppliers(directoryDb.prepare(`
    ${supplierSelect} WHERE s.is_active = 1 AND ${publicCatalogVisibilitySql("s")} AND s.id = ? GROUP BY s.id
  `).all(parsed.data.id) as Record<string, unknown>[]));
  const supplier = supplierRows[0];
  if (!supplier) {
    res.status(404).json({ error: "المورد غير موجود" });
    return;
  }
  const viewedAt = new Date().toISOString();
  if (!getTestModeSession(req) && !isTestModeAccount("supplier", parsed.data.id)) {
    directoryDb.prepare(
      "INSERT INTO supplier_page_views (supplier_id, viewed_at) VALUES (?, ?)",
    ).run(parsed.data.id, viewedAt);
    recordSupplierStat(parsed.data.id, "view", viewedAt);
  }
  const products = directoryDb.prepare(`
    ${productSelect} WHERE p.supplier_id = ? ORDER BY p.sort_order ASC, p.created_at DESC, p.id DESC
   `).all(parsed.data.id);
  const reviews = directoryDb.prepare(`
    SELECT id, supplier_id AS supplierId, reviewer_name AS reviewerName,
      rating, comment, created_at AS createdAt
    FROM reviews WHERE supplier_id = ? ORDER BY created_at DESC, id DESC
  `).all(parsed.data.id);
  const response = GetSupplierResponse.parse({ ...supplier, products, reviews });
  res.json(response);
});

router.post("/suppliers/:id/reviews", (req, res): void => {
  if (getSupplierIdFromRequest(req) && !isTestModeRequest(req, "buyer")) {
    res.status(403).json({ error: "لا يمكن للمورد تقييم مورد آخر أو التعليق عليه." });
    return;
  }
  const buyerId = getBuyerIdFromRequest(req);
  if (!buyerId) {
    res.status(401).json({ error: "سجّل الدخول كصاحب عمل لإضافة تقييم." });
    return;
  }
  const buyer = directoryDb.prepare("SELECT full_name AS name, moderation_status AS status FROM buyer_users WHERE id = ?")
    .get(buyerId) as { name: string; status: string } | undefined;
  if (!buyer || buyer.status !== "active") {
    res.status(403).json({ error: "حساب صاحب العمل غير مفعل للتقييم." });
    return;
  }
  if (isTestModeRequest(req, "buyer", buyerId)) {
    res.status(403).json({ error: "إضافة التقييمات متوقفة أثناء وضع الاختبار." });
    return;
  }
  const params = AddReviewParams.safeParse(req.params);
  const body = AddReviewBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "يرجى إدخال اسم وتقييم وتعليق صالح" });
    return;
  }
  const exists = directoryDb.prepare("SELECT id FROM suppliers WHERE id = ?").get(params.data.id);
  if (!exists) {
    res.status(404).json({ error: "المورد غير موجود" });
    return;
  }
  const createdAt = new Date().toISOString();
  const result = directoryDb.prepare(`
    INSERT INTO reviews (supplier_id, reviewer_name, rating, comment, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(params.data.id, buyer.name, body.data.rating, body.data.comment, createdAt);
  refreshSupplierRatings(params.data.id);
  recordSupplierStat(params.data.id, "review", createdAt);
  const review = {
    id: Number(result.lastInsertRowid),
    supplierId: params.data.id,
    reviewerName: buyer.name,
    rating: body.data.rating,
    comment: body.data.comment,
    createdAt,
  };
  res.status(201).json(AddReviewResponse.parse(review));
});

router.get("/products/:id", (req, res): void => {
  const parsed = GetProductParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const product = directoryDb.prepare(`
    SELECT p.id, p.supplier_id AS supplierId, s.name AS supplierName,
      p.category_id AS categoryId, c.name AS categoryName, p.name, p.weight, p.unit,
      p.country_of_origin AS countryOfOrigin, p.ingredients,
      p.technical_data AS technicalData, p.recommended_use AS recommendedUse,
      p.shelf_life AS shelfLife, p.storage_conditions AS storageConditions,
      p.min_order AS minOrder, p.image_url AS imageUrl, p.created_at AS createdAt
    FROM products p JOIN suppliers s ON s.id = p.supplier_id
    JOIN categories c ON c.id = p.category_id
    WHERE p.id = ? AND s.is_active = 1 AND ${publicCatalogVisibilitySql("s")}
  `).get(parsed.data.id) as Record<string, unknown> | undefined;
  if (!product) {
    res.status(404).json({ error: "المنتج غير موجود" });
    return;
  }
  const supplierId = Number(product.supplierId);
  const categoryId = Number(product.categoryId);
  const productId = Number(product.id);
  const supplierRows = withVisibility(normalizeSuppliers(directoryDb.prepare(`
    ${supplierSelect} WHERE s.is_active = 1 AND ${publicCatalogVisibilitySql("s")} AND s.id = ? GROUP BY s.id
  `).all(supplierId) as Record<string, unknown>[]));
  const similarProducts = directoryDb.prepare(`
    ${productSelect}
    WHERE p.category_id = ? AND p.supplier_id != ? AND p.id != ?
    ORDER BY s.average_rating DESC, p.created_at DESC LIMIT 4
  `).all(categoryId, supplierId, productId);
  const response = GetProductResponse.parse({
    ...product,
    supplier: normalizeSuppliers(supplierRows)[0],
    similarProducts,
  });
  res.json(response);
});

router.post("/contact", (req, res): void => {
  const body = SendContactBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "يرجى استكمال بيانات الرسالة بشكل صحيح" });
    return;
  }
  directoryDb.prepare(`
    INSERT INTO contact_messages (name, email, subject, message, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(body.data.name, body.data.email, body.data.subject, body.data.message, new Date().toISOString());
  res.status(201).json(SendContactResponse.parse({
    success: true,
    message: "وصلتنا رسالتك، وسنتواصل معك قريباً.",
  }));
});

router.post("/register", (req, res): void => {
  const body = RegisterInterestBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "يرجى إدخال الاسم والبريد والمنطقة الشرقية" });
    return;
  }
  directoryDb.prepare(`
    INSERT INTO registration_interests (name, email, region, status, created_at)
    VALUES (?, ?, ?, 'pending', ?)
  `).run(body.data.name, body.data.email, body.data.region, new Date().toISOString());
  res.status(201).json(RegisterInterestResponse.parse({
    success: true,
    message: "تم تسجيل اهتمامك، وسنخبرك عند اكتمال التوسع في منطقتك.",
  }));
});

export default router;