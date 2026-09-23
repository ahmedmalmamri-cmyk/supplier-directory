import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDir = path.resolve(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

export const directoryDb = new DatabaseSync(
  path.join(dataDir, "bakery-directory.sqlite"),
);

directoryDb.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    price_monthly REAL NOT NULL DEFAULT 0,
    max_products INTEGER NOT NULL,
    max_images_per_product INTEGER NOT NULL,
    has_verified_badge INTEGER NOT NULL DEFAULT 0,
    has_featured_listing INTEGER NOT NULL DEFAULT 0,
    has_banner INTEGER NOT NULL DEFAULT 0,
    has_analytics INTEGER NOT NULL DEFAULT 0,
    has_priority_support INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    region TEXT NOT NULL,
    description TEXT NOT NULL,
    phone TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    is_verified INTEGER NOT NULL DEFAULT 0,
    average_rating REAL NOT NULL DEFAULT 0,
    plan_id INTEGER NOT NULL DEFAULT 1 REFERENCES plans(id),
    subscription_start_date TEXT,
    subscription_end_date TEXT,
    max_products_allowed INTEGER NOT NULL DEFAULT 3,
    is_featured INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    plan_id INTEGER NOT NULL REFERENCES plans(id),
    start_date TEXT NOT NULL,
    end_date TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    amount_paid REAL NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'free' CHECK (payment_method IN ('bank_transfer', 'cash', 'free')),
    notes TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    category_id INTEGER NOT NULL REFERENCES categories(id),
    name TEXT NOT NULL,
    weight TEXT NOT NULL,
    unit TEXT NOT NULL,
    country_of_origin TEXT NOT NULL,
    ingredients TEXT NOT NULL,
    technical_data TEXT NOT NULL,
    recommended_use TEXT NOT NULL,
    shelf_life TEXT NOT NULL,
    storage_conditions TEXT NOT NULL,
    min_order INTEGER NOT NULL,
    price REAL,
    image_url TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    reviewer_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS registration_interests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    region TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS supplier_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_code TEXT NOT NULL UNIQUE,
    business_name TEXT NOT NULL,
    contact_person TEXT NOT NULL,
    business_type TEXT NOT NULL,
    phone TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    email TEXT,
    website TEXT,
    city TEXT NOT NULL,
    address TEXT,
    delivers_to_other_cities INTEGER NOT NULL DEFAULT 0,
    other_cities TEXT,
    categories TEXT NOT NULL,
    min_order TEXT,
    description TEXT NOT NULL,
    commercial_license_url TEXT,
    id_card_url TEXT,
    health_certificate_url TEXT,
    accepted_terms INTEGER NOT NULL DEFAULT 0,
    accepted_data INTEGER NOT NULL DEFAULT 0,
    accepted_business INTEGER NOT NULL DEFAULT 0,
    accepted_publish INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    rejection_reason TEXT,
    admin_note TEXT,
    created_at TEXT NOT NULL,
    reviewed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS buyer_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_code TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    city TEXT NOT NULL,
    business_type TEXT NOT NULL,
    business_name TEXT,
    referral_source TEXT,
    newsletter_weekly INTEGER NOT NULL DEFAULT 0,
    buyers_group INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS directory_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_credentials (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS directory_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`);

const registrationColumns = directoryDb
  .prepare("PRAGMA table_info(registration_interests)")
  .all() as Array<{ name: string }>;
if (!registrationColumns.some((column) => column.name === "status")) {
  directoryDb.exec("ALTER TABLE registration_interests ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
}
if (!registrationColumns.some((column) => column.name === "reviewed_at")) {
  directoryDb.exec("ALTER TABLE registration_interests ADD COLUMN reviewed_at TEXT");
}

const supplierColumns = directoryDb
  .prepare("PRAGMA table_info(suppliers)")
  .all() as Array<{ name: string }>;
if (!supplierColumns.some((column) => column.name === "request_id")) {
  directoryDb.exec("ALTER TABLE suppliers ADD COLUMN request_id INTEGER");
}
if (!supplierColumns.some((column) => column.name === "is_active")) {
  directoryDb.exec("ALTER TABLE suppliers ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1");
}
if (!supplierColumns.some((column) => column.name === "plan_id")) {
  directoryDb.exec("ALTER TABLE suppliers ADD COLUMN plan_id INTEGER NOT NULL DEFAULT 1");
}
if (!supplierColumns.some((column) => column.name === "subscription_start_date")) {
  directoryDb.exec("ALTER TABLE suppliers ADD COLUMN subscription_start_date TEXT");
}
if (!supplierColumns.some((column) => column.name === "subscription_end_date")) {
  directoryDb.exec("ALTER TABLE suppliers ADD COLUMN subscription_end_date TEXT");
}
if (!supplierColumns.some((column) => column.name === "max_products_allowed")) {
  directoryDb.exec("ALTER TABLE suppliers ADD COLUMN max_products_allowed INTEGER NOT NULL DEFAULT 3");
}
if (!supplierColumns.some((column) => column.name === "is_featured")) {
  directoryDb.exec("ALTER TABLE suppliers ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0");
}
const supplierRequestColumns = directoryDb
  .prepare("PRAGMA table_info(supplier_requests)")
  .all() as Array<{ name: string }>;
if (supplierRequestColumns.length > 0 && !supplierRequestColumns.some((column) => column.name === "accepted_data")) {
  directoryDb.exec("ALTER TABLE supplier_requests ADD COLUMN accepted_data INTEGER NOT NULL DEFAULT 0");
}
const buyerRequestColumns = directoryDb
  .prepare("PRAGMA table_info(buyer_requests)")
  .all() as Array<{ name: string }>;
if (buyerRequestColumns.length > 0 && !buyerRequestColumns.some((column) => column.name === "newsletter_weekly")) {
  directoryDb.exec("ALTER TABLE buyer_requests ADD COLUMN newsletter_weekly INTEGER NOT NULL DEFAULT 0");
}
if (buyerRequestColumns.length > 0 && !buyerRequestColumns.some((column) => column.name === "buyers_group")) {
  directoryDb.exec("ALTER TABLE buyer_requests ADD COLUMN buyers_group INTEGER NOT NULL DEFAULT 0");
}
const productColumns = directoryDb
  .prepare("PRAGMA table_info(products)")
  .all() as Array<{ name: string }>;
if (productColumns.length > 0 && !productColumns.some((column) => column.name === "sort_order")) {
  directoryDb.exec("ALTER TABLE products ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
}
directoryDb.prepare(`
  INSERT OR IGNORE INTO directory_settings (key, value)
  VALUES ('available_cities', ?)
`).run(JSON.stringify(["الدمام", "الخبر", "الظهران", "الأحساء", "الجبيل", "القطيف", "حفر الباطن", "رأس تنورة"]));

directoryDb.prepare(`
  INSERT OR IGNORE INTO directory_settings (key, value)
  VALUES ('admin_whatsapp', ?)
`).run("0566866805");

directoryDb.prepare(`
  INSERT OR IGNORE INTO directory_settings (key, value)
  VALUES ('admin_email', ?)
`).run("ahmed.m.almamri@gmail.com");

directoryDb.prepare(`
  INSERT OR IGNORE INTO directory_settings (key, value)
  VALUES ('admin_address', ?)
`).run("الدمام، المنطقة الشرقية\nالمملكة العربية السعودية");

const categoryCount = directoryDb
  .prepare("SELECT COUNT(*) AS count FROM categories")
  .get() as { count: number };

if (categoryCount.count === 0) {
  const categories = [
    [1, "دقيق وخبز", "Wheat", "flour-bread"],
    [2, "سكر ومحليات", "Candy", "sugar-sweeteners"],
    [3, "دهون وزبدة", "Milk", "fats-butter"],
    [4, "شوكولاتة وكاكاو", "Cookie", "chocolate-cocoa"],
    [5, "مكسرات", "Nut", "nuts"],
    [6, "نكهات وألوان", "FlaskConical", "flavors-colors"],
    [7, "خمائر ومحسنات", "Sparkles", "yeast-improvers"],
    [8, "عبوات وتغليف", "Package", "packaging"],
  ] as const;
  const insert = directoryDb.prepare(
    "INSERT INTO categories (id, name, icon, slug) VALUES (?, ?, ?, ?)",
  );
  categories.forEach((row) => insert.run(...row));

}

const plans = [
  [1, "الباقة الأساسية", "basic", 0, 3, 3, 0, 0, 0, 0, 0, "ابدأ مجاناً واعرض 3 من أفضل منتجاتك", 1, 1],
  [2, "الباقة الاحترافية", "pro", 150, 7, 5, 1, 1, 0, 1, 1, "الأكثر اختياراً - 7 منتجات مع شارة موثق", 1, 2],
  [3, "الباقة المميزة", "premium", 400, 10, 10, 1, 1, 1, 1, 1, "أقصى ظهور - 10 منتجات مع بانر إعلاني", 1, 3],
] as const;
const insertPlan = directoryDb.prepare(`
  INSERT OR IGNORE INTO plans
    (id, name, slug, price_monthly, max_products, max_images_per_product,
     has_verified_badge, has_featured_listing, has_banner, has_analytics,
     has_priority_support, description, is_active, display_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
plans.forEach((plan) => insertPlan.run(...plan));

const seededSupplierNames = [
  "الشيف العصري", "عجائن السكر", "مصادر الحلى", "ديكور الكيك",
  "ملتقى الخبازين", "الجسر الحديث", "نجوم حلوى الشرقية",
  "شركة سنابل الدقيق", "مؤسسة مذاق الكاكاو", "روائع التغليف", "بيت المكسرات للتجارة",
  "الخميرة الذهبية", "أساس الحلوى", "زبدة الشرق", "إمداد المخبوزات",
];
const clearSeededSuppliersMigration = directoryDb.prepare(
  "SELECT name FROM directory_migrations WHERE name = ?",
).get("clear-seeded-suppliers") as { name: string } | undefined;

if (!clearSeededSuppliersMigration) {
  directoryDb.exec("BEGIN");
  try {
    const placeholders = seededSupplierNames.map(() => "?").join(",");
    const seededIds = directoryDb.prepare(
      `SELECT id FROM suppliers WHERE name IN (${placeholders})`,
    ).all(...seededSupplierNames).map((row) => (row as { id: number }).id);
    if (seededIds.length > 0) {
      const idPlaceholders = seededIds.map(() => "?").join(",");
      directoryDb.prepare(`DELETE FROM reviews WHERE supplier_id IN (${idPlaceholders})`).run(...seededIds);
      directoryDb.prepare(`DELETE FROM products WHERE supplier_id IN (${idPlaceholders})`).run(...seededIds);
      directoryDb.prepare(`DELETE FROM suppliers WHERE id IN (${idPlaceholders})`).run(...seededIds);
    }
    directoryDb.prepare(
      "INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)",
    ).run("clear-seeded-suppliers", new Date().toISOString());
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
}

const supplierNameCorrections = [
  ["النخبة العصري", "الشيف العصري"],
  ["عجمان السكر", "عجائن السكر"],
  ["مصادر حلو", "مصادر الحلى"],
] as const;
const nameCorrectionMigration = directoryDb.prepare(
  "SELECT name FROM directory_migrations WHERE name = ?",
).get("correct-supplier-names") as { name: string } | undefined;

if (!nameCorrectionMigration) {
  const updateSupplierName = directoryDb.prepare("UPDATE suppliers SET name = ? WHERE name = ?");
  supplierNameCorrections.forEach(([oldName, newName]) => updateSupplierName.run(newName, oldName));
  directoryDb.prepare(
    "INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)",
  ).run("correct-supplier-names", new Date().toISOString());
}

export function refreshSupplierRatings(supplierId?: number) {
  const where = supplierId ? "WHERE id = ?" : "";
  const statement = directoryDb.prepare(`
    UPDATE suppliers
    SET average_rating = COALESCE(
      (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE supplier_id = suppliers.id),
      0
    )
    ${where}${where ? " AND" : " WHERE"} EXISTS (
      SELECT 1 FROM reviews WHERE supplier_id = suppliers.id
    )
  `);
  supplierId ? statement.run(supplierId) : statement.run();
}

refreshSupplierRatings();