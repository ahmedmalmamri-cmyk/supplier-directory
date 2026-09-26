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
import { itemCategorySubtreeIds } from "../lib/item-category-aliases";
import { itemCategorySupplierCounts } from "../lib/item-category-supplier-counts";
import { categoryTagGroupIdsMap } from "../lib/item-category-groups";
import { getBuyerIdFromRequest } from "../lib/buyer-auth";
import { getSupplierIdFromRequest } from "../lib/supplier-auth";
import { recordSupplierStat } from "../lib/supplier-stats";

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
  JOIN categories c ON c.id = p.category_id
`;
const normalizeSuppliers = (rows: Record<string, unknown>[]) =>
  rows.map((row) => ({ ...row, isVerified: Boolean(row.isVerified), isFeatured: Boolean(row.isFeatured), hasWhatsApp: Boolean(row.hasWhatsApp) }));

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
    SELECT c.id, c.name, c.icon, c.slug, COUNT(p.id) AS productCount
    FROM categories c LEFT JOIN products p ON p.category_id = c.id
    GROUP BY c.id ORDER BY c.id
  `).all();
  const featuredSuppliers = normalizeSuppliers(directoryDb.prepare(`
    ${supplierSelect} WHERE s.is_active = 1 GROUP BY s.id ORDER BY s.is_featured DESC, s.is_verified DESC, s.average_rating DESC LIMIT 6
  `).all() as Record<string, unknown>[]);
  const latestProducts = directoryDb.prepare(`
    ${productSelect} ORDER BY p.created_at DESC, p.id DESC LIMIT 9
  `).all();
  const stats = directoryDb.prepare(`
    SELECT
      (SELECT COUNT(*) FROM suppliers WHERE is_active = 1) AS suppliers,
      (SELECT COUNT(*) FROM products) AS products,
      (SELECT COUNT(DISTINCT city) FROM suppliers WHERE is_active = 1 AND city != 'غير محدد') AS cities,
      (SELECT COUNT(*) FROM reviews) AS reviews
  `).get();
  res.json(GetHomeResponse.parse({ categories, featuredSuppliers, latestProducts, stats }));
});

router.get("/item-categories", (_req, res): void => {
  const rows = directoryDb.prepare(`
    WITH RECURSIVE active_category_tree(id) AS (
      SELECT c.id
      FROM item_categories c
      JOIN groups g ON g.id = c.id AND g.is_active = 1
      WHERE c.parent_id IS NULL AND c.is_active = 1
      UNION ALL
      SELECT child.id
      FROM item_categories child
      JOIN active_category_tree parent ON child.parent_id = parent.id
      JOIN groups g ON g.id = child.primary_group_id AND g.is_active = 1
      WHERE child.is_active = 1 AND child.primary_group_id = parent.id
    )
    SELECT id, name, icon, slug, group_name AS groupName, parent_id AS parentId,
      primary_group_id AS primaryGroupId, sub_group_id AS subGroupId,
      description, display_on_home AS displayOnHome, display_order AS displayOrder,
      is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
    FROM item_categories
    WHERE id IN (SELECT id FROM active_category_tree)
    ORDER BY COALESCE(parent_id, id),
      CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END, display_order, id
  `).all() as Array<{
    id: number;
    name: string;
    icon: string;
    slug: string;
    groupName: string;
    parentId: number | null;
    primaryGroupId: number | null;
    subGroupId: number | null;
    description: string | null;
    displayOnHome: number;
    displayOrder: number;
    isActive: number;
    createdAt: string;
    updatedAt: string;
  }>;
  const supplierCounts = itemCategorySupplierCounts(rows, true);
  const tagGroupIdsByCategory = categoryTagGroupIdsMap(true);
  const categories = rows.map((category) => ({
    ...category,
    tagGroupIds: tagGroupIdsByCategory.get(category.id) ?? [],
    displayOnHome: Boolean(category.displayOnHome),
    isActive: Boolean(category.isActive),
    supplierCount: supplierCounts.get(category.id) ?? 0,
  }));
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
  if (searchTerm && buyerId) {
    directoryDb.prepare(`
      INSERT INTO buyer_search_logs (search_term, searched_at, buyer_id) VALUES (?, ?, ?)
    `).run(searchTerm, new Date().toISOString(), buyerId);
  }
  const term = `%${parsed.data.q ?? ""}%`;
  const suppliers = normalizeSuppliers(directoryDb.prepare(`
    ${supplierSelect} WHERE s.is_active = 1 AND (
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
        FROM supplier_categories item_sc
        JOIN item_categories assigned ON assigned.id = item_sc.item_category_id
          AND assigned.is_active = 1
          AND (
            (assigned.parent_id IS NULL AND EXISTS (
              SELECT 1 FROM groups active_root
              WHERE active_root.id = assigned.id AND active_root.is_active = 1
            ))
            OR (assigned.primary_group_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM groups active_primary
              WHERE active_primary.id = assigned.primary_group_id
                AND active_primary.is_active = 1
            ))
          )
        LEFT JOIN groups primary_group
          ON primary_group.id = assigned.primary_group_id AND primary_group.is_active = 1
        LEFT JOIN groups assigned_group
          ON assigned_group.id = assigned.id AND assigned_group.is_active = 1
        WHERE item_sc.supplier_id = s.id
          AND (
            assigned.name LIKE ?
            OR primary_group.name LIKE ?
            OR assigned_group.name LIKE ?
            OR EXISTS (
              SELECT 1 FROM category_tags ct
              JOIN groups tagged_group ON tagged_group.id = ct.group_id
                AND tagged_group.is_active = 1
              WHERE ct.category_id = assigned.id AND tagged_group.name LIKE ?
            )
          )
      )
    )
    GROUP BY s.id ORDER BY s.average_rating DESC
  `).all(term, term, term, term, term, term, term, term, term, term, term, term) as Record<string, unknown>[]);
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
    SELECT c.id, c.name, c.icon, c.slug, COUNT(p.id) AS productCount
    FROM categories c LEFT JOIN products p ON p.category_id = c.id
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
  let filters = "WHERE p.category_id = ? AND s.is_active = 1";
  if (city) { filters += " AND s.city = ?"; values.push(city); }
  if (rating) { filters += " AND s.average_rating >= ?"; values.push(rating); }
  if (minOrder) { filters += " AND p.min_order <= ?"; values.push(minOrder); }
  const products = directoryDb.prepare(`
    ${productSelect} ${filters} ORDER BY ${order}
  `).all(...values);
  const suppliers = normalizeSuppliers(directoryDb.prepare(`
    ${supplierSelect}
    JOIN products cp ON cp.supplier_id = s.id
    WHERE cp.category_id = ? AND s.is_active = 1
    ${city ? "AND s.city = ?" : ""}
    ${rating ? "AND s.average_rating >= ?" : ""}
    GROUP BY s.id ORDER BY s.average_rating DESC
  `).all(
    params.data.id,
    ...([city, rating].filter((value) => value !== undefined) as (string | number)[]),
  ) as Record<string, unknown>[]);
  const cities = directoryDb.prepare(`
    SELECT DISTINCT s.city FROM suppliers s
    JOIN products p ON p.supplier_id = s.id WHERE p.category_id = ? AND s.is_active = 1 ORDER BY s.city
  `).all(params.data.id).map((row) => (row as { city: string }).city);
  res.json(FetchCategoryResponse.parse({ category, products, suppliers, cities }));
});

router.get("/suppliers", (req, res): void => {
  const parsed = ListSuppliersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { q, city, type, category, rating, package: supplierPackage, verified, sort = "rating" } = parsed.data;
  const values: (string | number)[] = [];
  const clauses: string[] = ["s.is_active = 1"];
  if (q) {
    const pattern = `%${q}%`;
    clauses.push(`(
      s.name LIKE ? OR s.description LIKE ? OR s.city LIKE ?
      OR EXISTS (
        SELECT 1 FROM supplier_requests sr
        WHERE sr.id = s.request_id AND (sr.categories LIKE ? OR sr.business_type LIKE ?)
      )
      OR EXISTS (
        SELECT 1 FROM products qp
        JOIN categories qc ON qc.id = qp.category_id
        WHERE qp.supplier_id = s.id
          AND (qp.name LIKE ? OR qp.country_of_origin LIKE ? OR qc.name LIKE ?)
      )
    )`);
    values.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern);
  }
  if (city) { clauses.push("s.city = ?"); values.push(city); }
  if (category) {
    const itemCategories = directoryDb.prepare(`
      SELECT id, name, parent_id AS parentId,
        primary_group_id AS primaryGroupId
      FROM item_categories c
      WHERE c.is_active = 1
        AND (
          (c.parent_id IS NULL AND EXISTS (
            SELECT 1 FROM groups g WHERE g.id = c.id AND g.is_active = 1
          ))
          OR (c.primary_group_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM groups g
            WHERE g.id = c.primary_group_id AND g.is_active = 1
          ))
        )
    `).all() as Array<{
      id: number;
      name: string;
      parentId: number | null;
      primaryGroupId: number | null;
    }>;
    const selectedItemCategory = itemCategories.find((item) => item.name === category);
    const knownItemCategory = directoryDb.prepare(`
      SELECT id FROM item_categories WHERE name = ?
    `).get(category);
    const knownGroup = directoryDb.prepare(`
      SELECT id FROM groups WHERE name = ?
    `).get(category);
    if (selectedItemCategory) {
      const itemCategoryIds = selectedItemCategory.parentId === null
        ? new Set((directoryDb.prepare(`
            SELECT id FROM item_categories
            WHERE is_active = 1 AND (id = ? OR primary_group_id = ?)
            UNION
            SELECT c.id
            FROM category_tags ct
            JOIN item_categories c ON c.id = ct.category_id AND c.is_active = 1
            JOIN groups g ON g.id = ct.group_id AND g.is_active = 1
            WHERE ct.group_id = ?
              AND EXISTS (
                SELECT 1 FROM groups primary_group
                WHERE primary_group.id = c.primary_group_id AND primary_group.is_active = 1
              )
          `).all(selectedItemCategory.id, selectedItemCategory.id, selectedItemCategory.id) as Array<{ id: number }>).map((row) => row.id))
        : itemCategorySubtreeIds(selectedItemCategory.id, itemCategories);
      const ids = [...itemCategoryIds];
      const categoryPlaceholders = ids.map(() => "?").join(", ");
      clauses.push(`EXISTS (
        SELECT 1 FROM supplier_categories sc
        JOIN item_categories assigned ON assigned.id = sc.item_category_id
        WHERE sc.supplier_id = s.id
          AND assigned.is_active = 1
          AND sc.item_category_id IN (${categoryPlaceholders})
      )`);
      values.push(...ids);
    } else if (knownItemCategory || knownGroup) {
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
      const requestCategoryFilters = patterns.map(() => "sr.categories LIKE ?").join(" OR ");
      const productCategoryFilters = patterns.map(() => "(tc.name LIKE ? OR tp.name LIKE ?)").join(" OR ");
      clauses.push(`(
        EXISTS (
          SELECT 1 FROM supplier_requests sr
          WHERE sr.id = s.request_id AND (${requestCategoryFilters})
        )
        OR EXISTS (
          SELECT 1 FROM products tp
          JOIN categories tc ON tc.id = tp.category_id
          WHERE tp.supplier_id = s.id AND (${productCategoryFilters})
        )
      )`);
      values.push(...patterns, ...patterns.flatMap((pattern) => [pattern, pattern]));
    }
  }
  if (type) {
    const pattern = `%${type}%`;
    clauses.push(`(
      EXISTS (
        SELECT 1 FROM supplier_requests sr
        WHERE sr.id = s.request_id AND sr.categories LIKE ?
      )
      OR EXISTS (
        SELECT 1 FROM products tp
        JOIN categories tc ON tc.id = tp.category_id
        WHERE tp.supplier_id = s.id AND (tc.name LIKE ? OR tp.name LIKE ?)
      )
    )`);
    values.push(pattern, pattern, pattern);
  }
  if (rating !== undefined) { clauses.push("s.average_rating >= ?"); values.push(rating); }
  if (supplierPackage === "verified") { clauses.push("s.is_verified = 1"); }
  if (supplierPackage === "featured") { clauses.push("s.is_featured = 1"); }
  if (verified !== undefined) { clauses.push("s.is_verified = ?"); values.push(verified ? 1 : 0); }
  const order = sort === "newest"
    ? "s.created_at DESC"
    : sort === "alphabetical" ? "s.name ASC" : "s.average_rating DESC";
  const rows = directoryDb.prepare(`
    ${supplierSelect}
    WHERE ${clauses.join(" AND ")}
    GROUP BY s.id ORDER BY ${order}
  `).all(...values) as Record<string, unknown>[];
  res.json(ListSuppliersResponse.parse(normalizeSuppliers(rows)));
});

router.get("/suppliers/:id", (req, res): void => {
  const parsed = GetSupplierParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const supplierRows = directoryDb.prepare(`
    ${supplierSelect} WHERE s.is_active = 1 AND s.id = ? GROUP BY s.id
  `).all(parsed.data.id) as Record<string, unknown>[];
  const supplier = normalizeSuppliers(supplierRows)[0];
  if (!supplier) {
    res.status(404).json({ error: "المورد غير موجود" });
    return;
  }
  const viewedAt = new Date().toISOString();
  directoryDb.prepare(
    "INSERT INTO supplier_page_views (supplier_id, viewed_at) VALUES (?, ?)",
  ).run(parsed.data.id, viewedAt);
  recordSupplierStat(parsed.data.id, "view", viewedAt);
  const products = directoryDb.prepare(`
    ${productSelect} WHERE p.supplier_id = ? ORDER BY p.sort_order ASC, p.created_at DESC, p.id DESC
   `).all(parsed.data.id);
  const reviews = directoryDb.prepare(`
    SELECT id, supplier_id AS supplierId, reviewer_name AS reviewerName,
      rating, comment, created_at AS createdAt
    FROM reviews WHERE supplier_id = ? ORDER BY created_at DESC, id DESC
  `).all(parsed.data.id);
  res.json(GetSupplierResponse.parse({ ...supplier, products, reviews }));
});

router.post("/suppliers/:id/reviews", (req, res): void => {
  if (getSupplierIdFromRequest(req)) {
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
    JOIN categories c ON c.id = p.category_id WHERE p.id = ?
  `).get(parsed.data.id) as Record<string, unknown> | undefined;
  if (!product) {
    res.status(404).json({ error: "المنتج غير موجود" });
    return;
  }
  const supplierId = Number(product.supplierId);
  const categoryId = Number(product.categoryId);
  const productId = Number(product.id);
  const supplierRows = directoryDb.prepare(`
    ${supplierSelect} WHERE s.id = ? GROUP BY s.id
  `).all(supplierId) as Record<string, unknown>[];
  const similarProducts = directoryDb.prepare(`
    ${productSelect}
    WHERE p.category_id = ? AND p.supplier_id != ? AND p.id != ?
    ORDER BY s.average_rating DESC, p.created_at DESC LIMIT 4
  `).all(categoryId, supplierId, productId);
  res.json(GetProductResponse.parse({
    ...product,
    supplier: normalizeSuppliers(supplierRows)[0],
    similarProducts,
  }));
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