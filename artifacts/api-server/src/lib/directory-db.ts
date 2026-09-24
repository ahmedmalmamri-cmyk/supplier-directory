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
  CREATE TABLE IF NOT EXISTS item_categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL,
    group_name TEXT NOT NULL,
    parent_id INTEGER REFERENCES item_categories(id),
    description TEXT,
    display_on_home INTEGER NOT NULL DEFAULT 0 CHECK (display_on_home IN (0, 1)),
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
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
    address TEXT,
    website TEXT,
    google_category TEXT,
    google_rating REAL,
    google_review_count INTEGER,
    hours_note TEXT,
    is_verified INTEGER NOT NULL DEFAULT 0,
    average_rating REAL NOT NULL DEFAULT 0,
    plan_id INTEGER NOT NULL DEFAULT 1 REFERENCES plans(id),
    subscription_start_date TEXT,
    subscription_end_date TEXT,
    max_products_allowed INTEGER NOT NULL DEFAULT 3,
    is_featured INTEGER NOT NULL DEFAULT 0,
     added_via TEXT NOT NULL DEFAULT 'legacy',
    invite_token TEXT,
    invite_sent_at TEXT,
    invite_opened_at TEXT,
    invite_completed_at TEXT,
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
    reviewed_at TEXT,
    invited_supplier_id INTEGER REFERENCES suppliers(id),
    product_images TEXT NOT NULL DEFAULT '[]'
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
    other_business_type TEXT,
    is_owner INTEGER NOT NULL DEFAULT 1,
    job_title TEXT,
    referral_source TEXT,
    newsletter_weekly INTEGER NOT NULL DEFAULT 0,
    buyers_group INTEGER NOT NULL DEFAULT 0,
    terms_accepted INTEGER NOT NULL DEFAULT 0,
    terms_accepted_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS buyer_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    city TEXT NOT NULL,
    business_type TEXT NOT NULL,
    business_name TEXT,
    other_business_type TEXT,
    is_owner INTEGER NOT NULL DEFAULT 1,
    job_title TEXT,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_login TEXT,
    moderation_status TEXT NOT NULL DEFAULT 'active',
    moderation_reason TEXT,
    moderation_updated_at TEXT,
    suspended_until TEXT
  );
  CREATE TABLE IF NOT EXISTS supplier_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL UNIQUE REFERENCES suppliers(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    created_at TEXT NOT NULL,
    last_login TEXT
  );
  CREATE TABLE IF NOT EXISTS contact_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer_id INTEGER NOT NULL REFERENCES buyer_users(id),
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    message TEXT NOT NULL,
    message_id TEXT NOT NULL UNIQUE,
    sent_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'read'))
  );
  CREATE TABLE IF NOT EXISTS supplier_page_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    viewed_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_supplier_page_views_supplier_date
    ON supplier_page_views (supplier_id, viewed_at);
  CREATE INDEX IF NOT EXISTS idx_contact_logs_supplier_buyer_date
    ON contact_logs (supplier_id, buyer_id, sent_at);
  CREATE TABLE IF NOT EXISTS buyer_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_log_id INTEGER NOT NULL UNIQUE REFERENCES contact_logs(id),
    buyer_id INTEGER NOT NULL REFERENCES buyer_users(id),
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    reason TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
    admin_note TEXT,
    created_at TEXT NOT NULL,
    reviewed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS buyer_moderation_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer_id INTEGER NOT NULL REFERENCES buyer_users(id),
    report_id INTEGER REFERENCES buyer_reports(id),
    previous_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    reason TEXT,
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
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL REFERENCES admin_credentials(id),
    action_type TEXT NOT NULL CHECK (action_type IN ('add', 'edit', 'transfer', 'delete')),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('category', 'supplier', 'buyer')),
    entity_id INTEGER NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_activity_log_created_at
    ON activity_log (created_at DESC, id DESC);
  CREATE TABLE IF NOT EXISTS directory_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`);

const itemCategoryColumns = directoryDb
  .prepare("PRAGMA table_info(item_categories)")
  .all() as Array<{ name: string }>;
if (!itemCategoryColumns.some((column) => column.name === "parent_id")) {
  directoryDb.exec("ALTER TABLE item_categories ADD COLUMN parent_id INTEGER REFERENCES item_categories(id)");
}
if (!itemCategoryColumns.some((column) => column.name === "description")) {
  directoryDb.exec("ALTER TABLE item_categories ADD COLUMN description TEXT");
}
if (!itemCategoryColumns.some((column) => column.name === "created_at")) {
  directoryDb.exec("ALTER TABLE item_categories ADD COLUMN created_at TEXT NOT NULL DEFAULT ''");
}
if (!itemCategoryColumns.some((column) => column.name === "updated_at")) {
  directoryDb.exec("ALTER TABLE item_categories ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
}
directoryDb.exec(`
  CREATE INDEX IF NOT EXISTS idx_item_categories_parent_order
    ON item_categories (parent_id, display_order, id);
`);
const itemCategoryTimestamp = new Date().toISOString();
directoryDb.prepare(`
  UPDATE item_categories
  SET created_at = CASE WHEN created_at = '' THEN ? ELSE created_at END,
      updated_at = CASE WHEN updated_at = '' THEN ? ELSE updated_at END
  WHERE created_at = '' OR updated_at = ''
`).run(itemCategoryTimestamp, itemCategoryTimestamp);

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
if (!supplierColumns.some((column) => column.name === "address")) {
  directoryDb.exec("ALTER TABLE suppliers ADD COLUMN address TEXT");
}
if (!supplierColumns.some((column) => column.name === "website")) {
  directoryDb.exec("ALTER TABLE suppliers ADD COLUMN website TEXT");
}
if (!supplierColumns.some((column) => column.name === "google_category")) {
  directoryDb.exec("ALTER TABLE suppliers ADD COLUMN google_category TEXT");
}
if (!supplierColumns.some((column) => column.name === "google_rating")) {
  directoryDb.exec("ALTER TABLE suppliers ADD COLUMN google_rating REAL");
}
if (!supplierColumns.some((column) => column.name === "google_review_count")) {
  directoryDb.exec("ALTER TABLE suppliers ADD COLUMN google_review_count INTEGER");
}
if (!supplierColumns.some((column) => column.name === "hours_note")) {
  directoryDb.exec("ALTER TABLE suppliers ADD COLUMN hours_note TEXT");
}
if (!supplierColumns.some((column) => column.name === "invite_token")) {
  directoryDb.exec("ALTER TABLE suppliers ADD COLUMN invite_token TEXT");
}
if (!supplierColumns.some((column) => column.name === "invite_sent_at")) {
  directoryDb.exec("ALTER TABLE suppliers ADD COLUMN invite_sent_at TEXT");
}
if (!supplierColumns.some((column) => column.name === "invite_opened_at")) {
  directoryDb.exec("ALTER TABLE suppliers ADD COLUMN invite_opened_at TEXT");
}
if (!supplierColumns.some((column) => column.name === "invite_completed_at")) {
  directoryDb.exec("ALTER TABLE suppliers ADD COLUMN invite_completed_at TEXT");
}
if (!supplierColumns.some((column) => column.name === "added_via")) {
  directoryDb.exec("ALTER TABLE suppliers ADD COLUMN added_via TEXT NOT NULL DEFAULT 'legacy'");
}
directoryDb.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_invite_token
  ON suppliers (invite_token) WHERE invite_token IS NOT NULL
`);

const sugarPasteGoogleInfoMigration = directoryDb.prepare(
  "SELECT name FROM directory_migrations WHERE name = ?",
).get("add-sugar-paste-google-info") as { name: string } | undefined;
if (!sugarPasteGoogleInfoMigration) {
  directoryDb.prepare(`
    UPDATE suppliers
    SET address = ?, website = ?, google_category = ?, google_rating = ?,
      google_review_count = ?, hours_note = ?
    WHERE name = ?
  `).run(
    "شارع الملك سعود بن عبدالعزيز، الربيع، الدمام 32241",
    "https://sugar4paste.com",
    "سوبرماركت",
    4.3,
    191,
    "قد تختلف ساعات العمل في العطلات",
    "عجائن السكر",
  );
  directoryDb.prepare(
    "INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)",
  ).run("add-sugar-paste-google-info", new Date().toISOString());
}
const supplierRequestColumns = directoryDb
  .prepare("PRAGMA table_info(supplier_requests)")
  .all() as Array<{ name: string }>;
if (supplierRequestColumns.length > 0 && !supplierRequestColumns.some((column) => column.name === "accepted_data")) {
  directoryDb.exec("ALTER TABLE supplier_requests ADD COLUMN accepted_data INTEGER NOT NULL DEFAULT 0");
}
if (supplierRequestColumns.length > 0 && !supplierRequestColumns.some((column) => column.name === "invited_supplier_id")) {
  directoryDb.exec("ALTER TABLE supplier_requests ADD COLUMN invited_supplier_id INTEGER REFERENCES suppliers(id)");
}
if (supplierRequestColumns.length > 0 && !supplierRequestColumns.some((column) => column.name === "product_images")) {
  directoryDb.exec("ALTER TABLE supplier_requests ADD COLUMN product_images TEXT NOT NULL DEFAULT '[]'");
}
const supplierSourceMigration = directoryDb.prepare(
  "SELECT name FROM directory_migrations WHERE name = ?",
).get("classify-existing-supplier-sources") as { name: string } | undefined;
if (!supplierSourceMigration && supplierRequestColumns.length > 0) {
  directoryDb.exec(`
    UPDATE suppliers SET added_via = 'legacy';
    UPDATE suppliers
    SET added_via = 'manual'
    WHERE is_active = 0
      AND invite_token IS NOT NULL
      AND description = 'بانتظار استكمال بيانات المورد.';
    UPDATE suppliers
    SET added_via = 'self_registered'
    WHERE added_via = 'legacy'
      AND request_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM supplier_requests r
        WHERE r.id = suppliers.request_id AND r.invited_supplier_id IS NULL
      )
  `);
  directoryDb.prepare(
    "INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)",
  ).run("classify-existing-supplier-sources", new Date().toISOString());
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
if (buyerRequestColumns.length > 0 && !buyerRequestColumns.some((column) => column.name === "is_owner")) {
  directoryDb.exec("ALTER TABLE buyer_requests ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 1");
}
if (buyerRequestColumns.length > 0 && !buyerRequestColumns.some((column) => column.name === "job_title")) {
  directoryDb.exec("ALTER TABLE buyer_requests ADD COLUMN job_title TEXT");
}
if (buyerRequestColumns.length > 0 && !buyerRequestColumns.some((column) => column.name === "other_business_type")) {
  directoryDb.exec("ALTER TABLE buyer_requests ADD COLUMN other_business_type TEXT");
}
if (buyerRequestColumns.length > 0 && !buyerRequestColumns.some((column) => column.name === "terms_accepted")) {
  directoryDb.exec("ALTER TABLE buyer_requests ADD COLUMN terms_accepted INTEGER NOT NULL DEFAULT 0");
}
if (buyerRequestColumns.length > 0 && !buyerRequestColumns.some((column) => column.name === "terms_accepted_at")) {
  directoryDb.exec("ALTER TABLE buyer_requests ADD COLUMN terms_accepted_at TEXT");
}
const buyerUserColumns = directoryDb
  .prepare("PRAGMA table_info(buyer_users)")
  .all() as Array<{ name: string; notnull: number }>;
if (buyerUserColumns.length > 0 && !buyerUserColumns.some((column) => column.name === "is_owner")) {
  directoryDb.exec("ALTER TABLE buyer_users ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 1");
}
if (buyerUserColumns.length > 0 && !buyerUserColumns.some((column) => column.name === "job_title")) {
  directoryDb.exec("ALTER TABLE buyer_users ADD COLUMN job_title TEXT");
}
if (buyerUserColumns.length > 0 && !buyerUserColumns.some((column) => column.name === "other_business_type")) {
  directoryDb.exec("ALTER TABLE buyer_users ADD COLUMN other_business_type TEXT");
}
if (buyerUserColumns.length > 0 && !buyerUserColumns.some((column) => column.name === "moderation_status")) {
  directoryDb.exec("ALTER TABLE buyer_users ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'active'");
}
if (buyerUserColumns.length > 0 && !buyerUserColumns.some((column) => column.name === "moderation_reason")) {
  directoryDb.exec("ALTER TABLE buyer_users ADD COLUMN moderation_reason TEXT");
}
if (buyerUserColumns.length > 0 && !buyerUserColumns.some((column) => column.name === "moderation_updated_at")) {
  directoryDb.exec("ALTER TABLE buyer_users ADD COLUMN moderation_updated_at TEXT");
}
if (buyerUserColumns.length > 0 && !buyerUserColumns.some((column) => column.name === "suspended_until")) {
  directoryDb.exec("ALTER TABLE buyer_users ADD COLUMN suspended_until TEXT");
}
const buyerEmailColumn = buyerUserColumns.find((column) => column.name === "email");
if (buyerEmailColumn?.notnull === 1) {
  directoryDb.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;
    CREATE TABLE buyer_users_optional_email (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      email TEXT UNIQUE,
      city TEXT NOT NULL,
      business_type TEXT NOT NULL,
      business_name TEXT,
      other_business_type TEXT,
      is_owner INTEGER NOT NULL DEFAULT 1,
      job_title TEXT,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_login TEXT,
      moderation_status TEXT NOT NULL DEFAULT 'active',
      moderation_reason TEXT,
      moderation_updated_at TEXT,
      suspended_until TEXT
    );
    INSERT INTO buyer_users_optional_email
      (id, full_name, phone, email, city, business_type, business_name, other_business_type,
       is_owner, job_title, password_hash, created_at, last_login, moderation_status,
       moderation_reason, moderation_updated_at, suspended_until)
    SELECT id, full_name, phone, email, city, business_type, business_name, other_business_type,
      is_owner, job_title, password_hash, created_at, last_login, moderation_status,
      moderation_reason, moderation_updated_at, suspended_until
    FROM buyer_users;
    DROP TABLE buyer_users;
    ALTER TABLE buyer_users_optional_email RENAME TO buyer_users;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}
directoryDb.exec(`
  CREATE TABLE IF NOT EXISTS buyer_invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    business_name TEXT NOT NULL,
    business_type TEXT NOT NULL,
    city TEXT NOT NULL,
    internal_notes TEXT NOT NULL DEFAULT '',
    token_nonce TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    invited_at TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT 'الإدارة',
    invite_sent_at TEXT,
    activated_at TEXT,
    buyer_id INTEGER UNIQUE REFERENCES buyer_users(id),
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_buyer_invitations_phone
    ON buyer_invitations (phone);
  CREATE TABLE IF NOT EXISTS buyer_search_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    search_term TEXT NOT NULL,
    searched_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_buyer_search_logs_term_date
    ON buyer_search_logs (search_term, searched_at);
`);
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

const itemCategorySeed = [
  [1, "دقيق", "🥖", "المواد الأساسية", 1, 1],
  [2, "سميد وبرغل", "🌾", "المواد الأساسية", 0, 2],
  [3, "سكر", "🍰", "المواد الأساسية", 1, 3],
  [4, "زبدة ودهون", "🧈", "المواد الأساسية", 1, 4],
  [5, "مارجرين", "🧴", "المواد الأساسية", 0, 5],
  [6, "سمن", "🧈", "المواد الأساسية", 0, 6],
  [7, "حليب ومشتقاته", "🥛", "منتجات الألبان", 1, 7],
  [8, "أجبان", "🧀", "منتجات الألبان", 1, 8],
  [9, "زبادي وقشطة", "🍶", "منتجات الألبان", 0, 9],
  [10, "كريمة", "🍦", "منتجات الألبان", 0, 10],
  [11, "شوكولاتة وكاكاو", "🍫", "الشوكولاتة والحلويات", 1, 11],
  [12, "حلوى وسكاكر", "🍬", "الشوكولاتة والحلويات", 0, 12],
  [13, "جيلاتين وكاسترد", "🍮", "الشوكولاتة والحلويات", 0, 13],
  [14, "خلطات جاهزة", "🍰", "الشوكولاتة والحلويات", 1, 14],
  [15, "مكسرات", "🥜", "المكسرات والفواكه", 1, 15],
  [16, "فواكه مجففة", "🍇", "المكسرات والفواكه", 0, 16],
  [17, "عسل ومحليات", "🍯", "المكسرات والفواكه", 0, 17],
  [18, "دبس", "🍯", "المكسرات والفواكه", 0, 18],
  [19, "خمائر ومحسنات", "🧪", "المواد الفنية", 1, 19],
  [20, "نكهات وألوان", "🌿", "المواد الفنية", 1, 20],
  [21, "فانيليا ومستخلصات", "🎨", "المواد الفنية", 0, 21],
  [22, "عجين سمبوسة", "🥟", "العجائن والجاهز", 0, 22],
  [23, "عجين بيتزا", "🥙", "العجائن والجاهز", 0, 23],
  [24, "خبز رقاق", "🫓", "العجائن والجاهز", 0, 24],
  [25, "خبز جاهز", "🥖", "العجائن والجاهز", 0, 25],
  [26, "معجنات مجمدة", "🥐", "العجائن والجاهز", 0, 26],
  [27, "علب وتغليف", "📦", "التغليف والطباعة", 1, 27],
  [28, "أكياس مطبوعة", "🛍️", "التغليف والطباعة", 0, 28],
  [29, "كراتين مطبوعة", "📦", "التغليف والطباعة", 0, 29],
  [30, "أدوات تزيين", "🎀", "التغليف والطباعة", 0, 30],
  [31, "معدات وأفران", "⚙️", "المعدات", 1, 31],
  [32, "أدوات صغيرة", "🔧", "المعدات", 0, 32],
] as const;
const upsertItemCategory = directoryDb.prepare(`
  INSERT INTO item_categories
    (id, name, icon, group_name, display_on_home, display_order, is_active)
  VALUES (?, ?, ?, ?, ?, ?, 1)
  ON CONFLICT(id) DO NOTHING
`);
itemCategorySeed.forEach((item) => upsertItemCategory.run(...item));

const cakeFillingsMigration = directoryDb.prepare(
  "SELECT name FROM directory_migrations WHERE name = ?",
).get("cake-fillings-item-categories") as { name: string } | undefined;
if (!cakeFillingsMigration) {
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    const homeCategoryOrder = [
      "دقيق",
      "سكر",
      "زبدة ودهون",
      "حليب ومشتقاته",
      "أجبان",
      "شوكولاتة وكاكاو",
      "خلطات جاهزة",
      "مكسرات",
      "خمائر ومحسنات",
      "نكهات وألوان",
      "علب وتغليف",
      "معدات وأفران",
    ];
    homeCategoryOrder.forEach((name, index) => {
      directoryDb.prepare(`
        UPDATE item_categories
        SET display_order = ?, updated_at = ?
        WHERE name = ? AND parent_id IS NULL AND display_on_home = 1
      `).run(index + 1, now, name);
    });
    const existingParent = directoryDb.prepare(
      "SELECT id FROM item_categories WHERE name = ?",
    ).get("حشوات الكيك") as { id: number } | undefined;
    const parentId = existingParent?.id ?? (
      directoryDb.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS id FROM item_categories").get() as { id: number }
    ).id;
    if (existingParent) {
      directoryDb.prepare(`
        UPDATE item_categories
        SET icon = '🍰', group_name = 'حشوات الكيك', parent_id = NULL,
            display_on_home = 1, display_order = 13, is_active = 1, updated_at = ?
        WHERE id = ?
      `).run(now, parentId);
    } else {
      directoryDb.prepare(`
        INSERT INTO item_categories
          (id, name, icon, group_name, parent_id, description, display_on_home,
           display_order, is_active, created_at, updated_at)
        VALUES (?, 'حشوات الكيك', '🍰', 'حشوات الكيك', NULL,
          'حشوات وكريمات تناسب المخابز ومحلات الحلويات.', 1, 13, 1, ?, ?)
      `).run(parentId, now, now);
    }

    const cakeFillingSubcategories = [
      "حشوة توت",
      "حشوة فراولة",
      "حشوة كريمة لوتس",
      "حشوة كريمة فستق",
      "حشوة كريمة نوتيلا",
      "حشوة شوكولاتة",
      "حشوة كراميل",
      "حشوة مانجو",
      "حشوة ليمون",
      "حشوة تفاح",
    ];
    for (const [index, name] of cakeFillingSubcategories.entries()) {
      const existing = directoryDb.prepare(
        "SELECT id FROM item_categories WHERE name = ?",
      ).get(name) as { id: number } | undefined;
      if (existing) {
        directoryDb.prepare(`
          UPDATE item_categories
          SET group_name = 'حشوات الكيك', parent_id = ?, display_on_home = 0,
              display_order = ?, is_active = 1, updated_at = ?
          WHERE id = ?
        `).run(parentId, index + 1, now, existing.id);
      } else {
        const id = (
          directoryDb.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS id FROM item_categories").get() as { id: number }
        ).id;
        directoryDb.prepare(`
          INSERT INTO item_categories
            (id, name, icon, group_name, parent_id, display_on_home,
             display_order, is_active, created_at, updated_at)
          VALUES (?, ?, '🍰', 'حشوات الكيك', ?, 0, ?, 1, ?, ?)
        `).run(id, name, parentId, index + 1, now, now);
      }
    }
    directoryDb.prepare(`
      INSERT INTO directory_migrations (name, applied_at)
      VALUES ('cake-fillings-item-categories', ?)
    `).run(now);
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
}

const groupedItemCategorySeed = [
  ["دقيق", "🥖", "المواد الأساسية", 1],
  ["سميد", "🌾", "المواد الأساسية", 2],
  ["برغل", "🌾", "المواد الأساسية", 3],
  ["نخالة", "🌾", "المواد الأساسية", 4],
  ["سكر", "🍰", "المواد الأساسية", 5],
  ["سكر بودرة", "🍰", "المواد الأساسية", 6],
  ["سكر بني", "🍰", "المواد الأساسية", 7],
  ["زبدة", "🧈", "الدهون والزبدة", 8],
  ["مارجرين", "🧈", "الدهون والزبدة", 9],
  ["سمن نباتي", "🧈", "الدهون والزبدة", 10],
  ["سمن حيواني", "🧈", "الدهون والزبدة", 11],
  ["زيت", "🛢️", "الدهون والزبدة", 12],
  ["زيت زيتون", "🫒", "الدهون والزبدة", 13],
  ["شورتنج", "🧈", "الدهون والزبدة", 14],
  ["حليب بودرة", "🥛", "منتجات الألبان", 15],
  ["حليب مكثف", "🥛", "منتجات الألبان", 16],
  ["حليب طازج", "🥛", "منتجات الألبان", 17],
  ["قشطة", "🍶", "منتجات الألبان", 18],
  ["كريمة خفق", "🍦", "منتجات الألبان", 19],
  ["كريمة طبخ", "🍦", "منتجات الألبان", 20],
  ["لبنة", "🍶", "منتجات الألبان", 21],
  ["زبادي", "🍶", "منتجات الألبان", 22],
  ["جبن كيري", "🧀", "الأجبان", 23],
  ["جبن موزاريلا", "🧀", "الأجبان", 24],
  ["جبن شيدر", "🧀", "الأجبان", 25],
  ["جبن فيتا", "🧀", "الأجبان", 26],
  ["جبن حلومي", "🧀", "الأجبان", 27],
  ["جبن عكاوي", "🧀", "الأجبان", 28],
  ["جبن رومي", "🧀", "الأجبان", 29],
  ["جبن كريمي", "🧀", "الأجبان", 30],
  ["جبن سائل", "🧀", "الأجبان", 31],
  ["شوكولاتة بلوك", "🍫", "الشوكولاتة والكاكاو", 32],
  ["شوكولاتة حبيبات", "🍫", "الشوكولاتة والكاكاو", 33],
  ["شوكولاتة بودرة", "🍫", "الشوكولاتة والكاكاو", 34],
  ["كاكاو بودرة", "🍫", "الشوكولاتة والكاكاو", 35],
  ["زبدة كاكاو", "🍫", "الشوكولاتة والكاكاو", 36],
  ["غاناش", "🍫", "الشوكولاتة والكاكاو", 37],
  ["صوص شوكولاتة", "🍫", "الشوكولاتة والكاكاو", 38],
  ["خلطات كيك", "🍰", "مكونات الكيك", 39],
  ["خلطات مافن", "🧁", "مكونات الكيك", 40],
  ["خلطات براوني", "🍫", "مكونات الكيك", 41],
  ["خلطات دونات", "🍩", "مكونات الكيك", 42],
  ["كاستر بودر", "🍮", "مكونات الكيك", 43],
  ["جيلاتين", "🍮", "مكونات الكيك", 44],
  ["جيلي", "🍮", "مكونات الكيك", 45],
  ["نشا", "🌾", "مكونات الكيك", 46],
  ["بيكنج بودر", "🧪", "مكونات الكيك", 47],
  ["حشوة توت", "🍓", "الحشوات والكريمات", 48],
  ["حشوة فراولة", "🍓", "الحشوات والكريمات", 49],
  ["حشوة مانجو", "🥭", "الحشوات والكريمات", 50],
] as const;

const groupedItemCategoriesMigration = directoryDb.prepare(
  "SELECT name FROM directory_migrations WHERE name = ?",
).get("grouped-item-category-catalog-v1") as { name: string } | undefined;
if (!groupedItemCategoriesMigration) {
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    const upsertItemCategory = directoryDb.prepare(`
      INSERT INTO item_categories
        (name, icon, group_name, parent_id, description, display_on_home,
         display_order, is_active, created_at, updated_at)
      VALUES (?, ?, ?, NULL, NULL, 0, ?, 1, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        icon = excluded.icon,
        group_name = excluded.group_name,
        display_order = excluded.display_order,
        is_active = 1,
        updated_at = excluded.updated_at
    `);
    for (const [name, icon, groupName, displayOrder] of groupedItemCategorySeed) {
      upsertItemCategory.run(name, icon, groupName, displayOrder, now, now);
    }
    directoryDb.prepare(`
      INSERT INTO directory_migrations (name, applied_at)
      VALUES ('grouped-item-category-catalog-v1', ?)
    `).run(now);
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
}

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

const restoreSupplierRatingFallbacksMigration = directoryDb.prepare(
  "SELECT name FROM directory_migrations WHERE name = ?",
).get("restore-supplier-rating-fallbacks") as { name: string } | undefined;
if (!restoreSupplierRatingFallbacksMigration) {
  directoryDb.prepare(`
    UPDATE suppliers
    SET average_rating = 4.2
    WHERE name IN ('ديكور الكيك', 'مركز ديكور الكيك (CDC)')
      AND google_rating IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM reviews WHERE reviews.supplier_id = suppliers.id
      )
      AND average_rating = 0
  `).run();
  directoryDb.prepare(
    "INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)",
  ).run("restore-supplier-rating-fallbacks", new Date().toISOString());
}

export function refreshSupplierRatings(supplierId?: number) {
  const where = supplierId ? "WHERE id = ?" : "";
  const statement = directoryDb.prepare(`
    UPDATE suppliers
    SET average_rating = COALESCE(
      (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE supplier_id = suppliers.id),
      google_rating,
      average_rating,
      0
    )
    ${where}
  `);
  supplierId ? statement.run(supplierId) : statement.run();
}

refreshSupplierRatings();