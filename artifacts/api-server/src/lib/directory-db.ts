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
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS directory_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`);

const actualSuppliers = [
  [1, "النخبة العصري", "غير محدد", "المنطقة الشرقية", "بيانات المورد قيد الإضافة والتحديث.", "", "", 0, "2026-09-21"],
  [2, "عجمان السكر", "غير محدد", "المنطقة الشرقية", "بيانات المورد قيد الإضافة والتحديث.", "", "", 0, "2026-09-21"],
  [3, "مصادر حلو", "غير محدد", "المنطقة الشرقية", "بيانات المورد قيد الإضافة والتحديث.", "", "", 0, "2026-09-21"],
  [4, "ديكور الكيك", "غير محدد", "المنطقة الشرقية", "بيانات المورد قيد الإضافة والتحديث.", "", "", 0, "2026-09-21"],
  [5, "ملتقى الخبازين", "غير محدد", "المنطقة الشرقية", "بيانات المورد قيد الإضافة والتحديث.", "", "", 0, "2026-09-21"],
  [6, "الجسر الحديث", "غير محدد", "المنطقة الشرقية", "بيانات المورد قيد الإضافة والتحديث.", "", "", 0, "2026-09-21"],
  [7, "نجوم حلوى الشرقية", "غير محدد", "المنطقة الشرقية", "بيانات المورد قيد الإضافة والتحديث.", "", "", 0, "2026-09-21"],
] as const;

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

  const insertSupplier = directoryDb.prepare(`
    INSERT INTO suppliers
      (id, name, city, region, description, phone, whatsapp, is_verified, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  actualSuppliers.forEach((row) => insertSupplier.run(...row));

  const products: readonly never[] = [];
  const insertProduct = directoryDb.prepare(`
    INSERT INTO products
      (id, supplier_id, category_id, name, weight, unit, country_of_origin, ingredients,
       technical_data, recommended_use, shelf_life, storage_conditions, min_order, price,
       image_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
  `);
  products.forEach((row, index) =>
    insertProduct.run(...row, `2026-09-${String(20 - (index % 18)).padStart(2, "0")}`),
  );

  const reviews: readonly never[] = [];
  const insertReview = directoryDb.prepare(
    "INSERT INTO reviews (supplier_id, reviewer_name, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  reviews.forEach((row, index) =>
    insertReview.run(...row, `2026-09-${String(18 - (index % 14)).padStart(2, "0")}`),
  );
}

const demoSupplierNames = [
  "شركة سنابل الدقيق", "مؤسسة مذاق الكاكاو", "روائع التغليف", "بيت المكسرات للتجارة",
  "الخميرة الذهبية", "أساس الحلوى", "زبدة الشرق", "إمداد المخبوزات",
];
const hasDemoSuppliers = directoryDb.prepare(
  `SELECT COUNT(*) AS count FROM suppliers WHERE name IN (${demoSupplierNames.map(() => "?").join(",")})`,
).get(...demoSupplierNames) as { count: number };
const migration = directoryDb.prepare(
  "SELECT name FROM directory_migrations WHERE name = ?",
).get("replace-demo-suppliers") as { name: string } | undefined;

if (hasDemoSuppliers.count > 0 && !migration) {
  directoryDb.exec("BEGIN");
  try {
    directoryDb.exec("DELETE FROM reviews; DELETE FROM products; DELETE FROM suppliers;");
    const insertSupplier = directoryDb.prepare(`
      INSERT INTO suppliers
        (id, name, city, region, description, phone, whatsapp, is_verified, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    actualSuppliers.forEach((row) => insertSupplier.run(...row));
    directoryDb.prepare(
      "INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)",
    ).run("replace-demo-suppliers", new Date().toISOString());
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
}

export function refreshSupplierRatings(supplierId?: number) {
  const where = supplierId ? "WHERE id = ?" : "";
  const statement = directoryDb.prepare(`
    UPDATE suppliers
    SET average_rating = COALESCE(
      (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE supplier_id = suppliers.id),
      0
    )
    ${where}
  `);
  supplierId ? statement.run(supplierId) : statement.run();
}

refreshSupplierRatings();