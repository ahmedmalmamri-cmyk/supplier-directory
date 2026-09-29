import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  FetchCategoryResponse,
  GetHomeResponse,
  GetProductResponse,
  GetSupplierResponse,
  ListSuppliersResponse,
  SearchDirectoryResponse,
} from "../../../../lib/api-zod/src/generated/api.ts";
import {
  publicCatalogOfferEligibilitySql,
  publicCatalogVisibilitySql,
} from "./catalog-visibility.ts";
import { buildPublicAlmondSupplierFilter, getAlmondItemIds } from "./almond-variants.ts";

test("public visibility requires a public approved active catalog offer", (t) => {
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  database.exec(`
    CREATE TABLE suppliers (id INTEGER PRIMARY KEY, is_active INTEGER NOT NULL);
    CREATE TABLE supplier_taxonomy_nodes (
      id INTEGER PRIMARY KEY, parent_id INTEGER, name TEXT NOT NULL, is_active INTEGER NOT NULL
    );
    CREATE TABLE supplier_taxonomy_items (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_en TEXT,
      category_id INTEGER NOT NULL, is_active INTEGER NOT NULL
    );
    CREATE TABLE supplier_taxonomy_item_suppliers (
      supplier_id INTEGER NOT NULL, item_id INTEGER NOT NULL
    );
    CREATE TABLE supplier_almond_variant_preferences (
      supplier_id INTEGER PRIMARY KEY, mode TEXT NOT NULL
    );
    CREATE TABLE supplier_almond_variant_choices (
      supplier_id INTEGER NOT NULL, form TEXT NOT NULL,
      preparation TEXT NOT NULL, size TEXT
    );
    CREATE TABLE supplier_catalog_subtypes (
      id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL, name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL, is_approved INTEGER NOT NULL, status TEXT NOT NULL
    );
    CREATE TABLE supplier_catalog_offers (
      id INTEGER PRIMARY KEY, supplier_id INTEGER NOT NULL, subtype_id INTEGER NOT NULL,
      price REAL, last_updated TEXT NOT NULL, is_active INTEGER NOT NULL
    );

    INSERT INTO suppliers (id, is_active) VALUES
      (1, 1), (2, 1), (3, 1), (4, 1), (5, 1), (6, 1), (7, 0), (8, 1), (9, 1), (10, 1);
    INSERT INTO supplier_taxonomy_nodes (id, parent_id, name, is_active) VALUES
      (1, NULL, 'المواد الأساسية', 1), (2, 1, 'دقيق', 1),
      (3, NULL, 'الخدمات والاستشارات', 1), (4, 3, 'خدمات متخصصة', 1),
      (5, NULL, 'خدمات واستشارات', 1), (6, 5, 'خدمات أخرى', 1),
      (7, NULL, 'المواد المؤرشفة', 0);
    INSERT INTO supplier_taxonomy_items (id, name, name_en, category_id, is_active) VALUES
      (10, 'دقيق', 'Flour', 2, 1), (11, 'استشارة', 'Consulting', 4, 1),
      (12, 'استشارات', 'Services', 6, 1), (13, 'سكر مؤرشف', 'Archived sugar', 2, 0),
      (14, 'دقيق مؤرشف', 'Archived flour', 7, 1), (15, 'كاكاو', 'Cocoa', 2, 1),
      (16, 'لوز حب', 'Whole almonds', 2, 1), (17, 'لوز شرائح', 'Sliced almonds', 2, 1),
      (18, 'لوز مطحون', 'Ground almonds', 2, 1);
    INSERT INTO supplier_taxonomy_item_suppliers (supplier_id, item_id) VALUES
      (6, 15), (6, 16), (6, 17);
    INSERT INTO supplier_almond_variant_preferences (supplier_id, mode) VALUES (6, 'selected');
    INSERT INTO supplier_almond_variant_choices (supplier_id, form, preparation, size)
      VALUES (6, 'slices', 'raw', NULL);
    INSERT INTO supplier_catalog_subtypes (id, item_id, name_ar, name_en, is_approved, status) VALUES
      (20, 10, 'دقيق قيد المراجعة', 'Pending flour', 0, 'pending'),
      (21, 10, 'دقيق مخابز', 'Bakery flour', 1, 'approved'),
      (22, 11, 'استشارة', 'Consulting', 1, 'approved'),
      (23, 12, 'خدمات', 'Services', 1, 'approved'),
      (24, 13, 'سكر', 'Sugar', 1, 'approved'),
      (25, 14, 'دقيق', 'Flour', 1, 'approved'),
      (26, 16, 'لوز حب نيء', 'Raw whole almonds', 1, 'approved'),
      (27, 17, 'لوز شرائح نيء', 'Raw sliced almonds', 1, 'approved'),
      (28, 18, 'لوز مطحون', 'Ground almonds', 1, 'approved');
    INSERT INTO supplier_catalog_offers
      (id, supplier_id, subtype_id, price, last_updated, is_active) VALUES
      (30, 2, 20, 10, '2026-01-01', 1),
      (31, 3, 21, 11, '2026-01-01', 0),
      (32, 4, 22, 12, '2026-01-01', 1),
      (33, 5, 23, 13, '2026-01-01', 1),
      (34, 6, 21, 42.5, '2026-01-02', 1),
      (35, 7, 21, 15, '2026-01-01', 1),
      (36, 8, 24, 16, '2026-01-01', 1),
      (37, 9, 25, 17, '2026-01-01', 1),
      (38, 6, 26, 50, '2026-01-03', 1),
      (39, 10, 26, 55, '2026-01-03', 1);
  `);

  const visibleSuppliers = database.prepare(`
    SELECT s.id FROM suppliers s
    WHERE s.is_active = 1 AND ${publicCatalogVisibilitySql("s")}
    ORDER BY s.id
  `).all().map((row) => (row as { id: number }).id);
  assert.deepEqual(visibleSuppliers, [6, 10]);

  const unrelatedLegacyCategoryMatch = database.prepare(`
    SELECT 1 FROM supplier_catalog_offers categoryOffer
    JOIN supplier_catalog_subtypes categorySubtype ON categorySubtype.id = categoryOffer.subtype_id
    JOIN supplier_taxonomy_items categoryItem ON categoryItem.id = categorySubtype.item_id
    JOIN supplier_taxonomy_nodes categoryNode ON categoryNode.id = categoryItem.category_id
    WHERE categoryOffer.supplier_id = 6
      AND ${publicCatalogOfferEligibilitySql("categoryOffer", "categorySubtype", "categoryItem", "categoryNode")}
      AND categoryItem.id = 15
  `).get();
  assert.equal(unrelatedLegacyCategoryMatch, undefined);
  assert.equal((database.prepare(`
    SELECT 1 FROM supplier_taxonomy_item_suppliers
    WHERE supplier_id = 6 AND item_id = 15
  `).get() !== undefined), true);

  const almondItemIds = getAlmondItemIds(database);
  const exactAlmondMatch = (supplierId: number, form: "whole" | "slices", itemId: number) => {
    const legacyPreference = buildPublicAlmondSupplierFilter(almondItemIds, { form });
    return database.prepare(`
      SELECT 1 FROM suppliers s
      WHERE s.id = ? AND EXISTS (
        SELECT 1 FROM supplier_catalog_offers almondOffer
        JOIN supplier_catalog_subtypes almondSubtype ON almondSubtype.id = almondOffer.subtype_id
        JOIN supplier_taxonomy_items almondItem ON almondItem.id = almondSubtype.item_id
        JOIN supplier_taxonomy_nodes almondNode ON almondNode.id = almondItem.category_id
        WHERE almondOffer.supplier_id = s.id
          AND ${publicCatalogOfferEligibilitySql("almondOffer", "almondSubtype", "almondItem", "almondNode")}
          AND almondItem.id = ?
      ) AND ${legacyPreference.sql}
    `).get(supplierId, itemId, ...legacyPreference.params);
  };
  assert.equal(exactAlmondMatch(6, "slices", 17), undefined);
  assert.equal(exactAlmondMatch(6, "whole", 16), undefined);
  assert.equal(exactAlmondMatch(10, "whole", 16), undefined);
  assert.ok(database.prepare(`
    SELECT 1 FROM supplier_catalog_offers almondOffer
    JOIN supplier_catalog_subtypes almondSubtype ON almondSubtype.id = almondOffer.subtype_id
    JOIN supplier_taxonomy_items almondItem ON almondItem.id = almondSubtype.item_id
    JOIN supplier_taxonomy_nodes almondNode ON almondNode.id = almondItem.category_id
    WHERE almondOffer.supplier_id = 10
      AND ${publicCatalogOfferEligibilitySql("almondOffer", "almondSubtype", "almondItem", "almondNode")}
      AND almondItem.id IN (${almondItemIds.map(() => "?").join(", ")})
  `).get(...almondItemIds));

  const publicOfferRow = database.prepare(`
    SELECT subtype.id, subtype.item_id AS itemId,
      subtype.name_ar AS nameAr, subtype.name_en AS nameEn,
      item.name AS itemName, item.name_en AS itemNameEn,
      offer.price, offer.last_updated AS lastUpdated
    FROM supplier_catalog_offers offer
    JOIN supplier_catalog_subtypes subtype ON subtype.id = offer.subtype_id
    JOIN supplier_taxonomy_items item ON item.id = subtype.item_id
    JOIN supplier_taxonomy_nodes node ON node.id = item.category_id
    WHERE offer.supplier_id = 6
      AND ${publicCatalogOfferEligibilitySql("offer", "subtype", "item", "node")}
  `).get() as {
    id: number;
    itemId: number;
    nameAr: string;
    nameEn: string;
    itemName: string;
    itemNameEn: string | null;
    price: number | null;
    lastUpdated: string;
  } | undefined;
  const publicOffer = publicOfferRow ? { ...publicOfferRow } : undefined;
  assert.deepEqual(publicOffer, {
    id: 21,
    itemId: 10,
    nameAr: "دقيق مخابز",
    nameEn: "Bakery flour",
    itemName: "دقيق",
    itemNameEn: "Flour",
    price: 42.5,
    lastUpdated: "2026-01-02",
  });

  const offeredSubtypes = publicOffer ? [publicOffer] : [];
  const supplier = {
    id: 6,
    name: "مورد ظاهر",
    city: "الدمام",
    region: "المنطقة الشرقية",
    description: "مورد مؤهل للظهور",
    hasWhatsApp: false,
    address: null,
    website: null,
    googleCategory: null,
    googleRating: null,
    googleReviewCount: null,
    hoursNote: null,
    isVerified: false,
    isFeatured: false,
    averageRating: 0,
    createdAt: "2026-01-02T00:00:00.000Z",
    productCount: 0,
    offeredSubtypes,
  };
  assert.equal(ListSuppliersResponse.parse([supplier])[0]?.offeredSubtypes.length, 1);
  assert.equal(SearchDirectoryResponse.parse({ suppliers: [supplier], products: [] }).suppliers[0]?.offeredSubtypes.length, 1);
  assert.equal(GetHomeResponse.parse({
    categories: [],
    featuredSuppliers: [supplier],
    latestProducts: [],
    stats: { suppliers: 1, products: 0, cities: 1, reviews: 0 },
  }).featuredSuppliers[0]?.offeredSubtypes.length, 1);
  assert.equal(FetchCategoryResponse.parse({
    category: { id: 1, name: "طحين", icon: "", slug: "flour", productCount: 0 },
    suppliers: [supplier],
    products: [],
    cities: [],
  }).suppliers[0]?.offeredSubtypes.length, 1);
  assert.equal(GetSupplierResponse.parse({
    ...supplier,
    products: [],
    reviews: [],
  }).offeredSubtypes.length, 1);
  assert.equal(GetProductResponse.parse({
    id: 101,
    supplierId: 6,
    supplierName: supplier.name,
    categoryId: 1,
    categoryName: "طحين",
    name: "دقيق",
    weight: "1",
    unit: "كجم",
    countryOfOrigin: "السعودية",
    minOrder: 1,
    imageUrl: null,
    createdAt: supplier.createdAt,
    ingredients: "",
    technicalData: "",
    recommendedUse: "",
    shelfLife: "",
    storageConditions: "",
    supplier,
    similarProducts: [],
  }).supplier.offeredSubtypes.length, 1);
});