import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  legacyItemCategoryAliasTargets,
  resolveDirectItemCategoryIdsForSelections,
} from "./item-category-aliases";
import { itemCategorySlugBase } from "./item-category-slugs";

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
    slug TEXT,
    description TEXT,
    display_on_home INTEGER NOT NULL DEFAULT 0 CHECK (display_on_home IN (0, 1)),
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS permanently_deleted_item_categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    deleted_at TEXT NOT NULL
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
  CREATE TABLE IF NOT EXISTS supplier_categories (
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    item_category_id INTEGER NOT NULL REFERENCES item_categories(id) ON DELETE CASCADE,
    PRIMARY KEY (supplier_id, item_category_id)
  );
  CREATE INDEX IF NOT EXISTS idx_supplier_categories_item_category
    ON supplier_categories (item_category_id, supplier_id);
  CREATE TABLE IF NOT EXISTS item_category_aliases (
    alias TEXT NOT NULL,
    item_category_id INTEGER NOT NULL REFERENCES item_categories(id) ON DELETE CASCADE,
    PRIMARY KEY (alias, item_category_id)
  );
  CREATE INDEX IF NOT EXISTS idx_item_category_aliases_item_category
    ON item_category_aliases (item_category_id, alias);
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
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer_id INTEGER NOT NULL REFERENCES buyer_users(id),
    category_id INTEGER NOT NULL REFERENCES item_categories(id),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT NOT NULL,
    quantity REAL NOT NULL CHECK (typeof(quantity) IN ('integer', 'real') AND quantity > 0),
    unit TEXT NOT NULL CHECK (unit IN ('كيلو', 'كرتون', 'كيس', 'علبة')),
    frequency TEXT NOT NULL CHECK (frequency IN ('مرة واحدة', 'أسبوعي', 'شهري')),
    city TEXT NOT NULL CHECK (length(trim(city)) > 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'expired')),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_requests_buyer_status_created
    ON requests (buyer_id, status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_requests_category_city_status_expires
    ON requests (category_id, city, status, expires_at);
  CREATE TABLE IF NOT EXISTS supplier_request_contact_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL REFERENCES requests(id),
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    sent_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_supplier_request_contacts_supplier_date
    ON supplier_request_contact_logs (supplier_id, sent_at DESC);
  CREATE INDEX IF NOT EXISTS idx_supplier_request_contacts_request_date
    ON supplier_request_contact_logs (request_id, sent_at DESC);
  CREATE TABLE IF NOT EXISTS supplier_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL UNIQUE REFERENCES suppliers(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    created_at TEXT NOT NULL,
    last_login TEXT
  );
  CREATE TABLE IF NOT EXISTS supplier_activation_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    revoked_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_supplier_activation_tokens_supplier
    ON supplier_activation_tokens (supplier_id, expires_at);
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

const requestUnitMigrationName = "requests-unit-box-v1";
const requestUnitMigration = directoryDb
  .prepare("SELECT name FROM directory_migrations WHERE name = ?")
  .get(requestUnitMigrationName);
if (!requestUnitMigration) {
  const requestTable = directoryDb
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'requests'")
    .get() as { sql: string } | undefined;

  if (requestTable && !requestTable.sql.includes("'علبة'")) {
    const childTables = directoryDb.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND lower(sql) LIKE '%references requests%'
    `).all() as Array<{ name: string }>;
    if (childTables.length > 0) {
      throw new Error(`Cannot safely update requests.unit; dependent tables exist: ${childTables.map((table) => table.name).join(", ")}`);
    }

    directoryDb.exec("BEGIN IMMEDIATE");
    try {
      const before = directoryDb.prepare("SELECT COUNT(*) AS count FROM requests").get() as { count: number };
      const previousSequence = directoryDb
        .prepare("SELECT seq FROM sqlite_sequence WHERE name = 'requests'")
        .get() as { seq: number } | undefined;
      directoryDb.exec(`
        ALTER TABLE requests RENAME TO requests_units_legacy;
        CREATE TABLE requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          buyer_id INTEGER NOT NULL REFERENCES buyer_users(id),
          category_id INTEGER NOT NULL REFERENCES item_categories(id),
          title TEXT NOT NULL CHECK (length(trim(title)) > 0),
          description TEXT NOT NULL,
          quantity REAL NOT NULL CHECK (typeof(quantity) IN ('integer', 'real') AND quantity > 0),
          unit TEXT NOT NULL CHECK (unit IN ('كيلو', 'كرتون', 'كيس', 'علبة')),
          frequency TEXT NOT NULL CHECK (frequency IN ('مرة واحدة', 'أسبوعي', 'شهري')),
          city TEXT NOT NULL CHECK (length(trim(city)) > 0),
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'expired')),
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        );
        INSERT INTO requests
          (id, buyer_id, category_id, title, description, quantity, unit, frequency, city, status, created_at, expires_at)
        SELECT id, buyer_id, category_id, title, description, quantity, unit, frequency, city, status, created_at, expires_at
        FROM requests_units_legacy;
        DROP TABLE requests_units_legacy;
        CREATE INDEX idx_requests_buyer_status_created
          ON requests (buyer_id, status, created_at DESC);
        CREATE INDEX idx_requests_category_city_status_expires
          ON requests (category_id, city, status, expires_at);
      `);
      const after = directoryDb.prepare("SELECT COUNT(*) AS count FROM requests").get() as { count: number };
      if (before.count !== after.count) {
        throw new Error(`Requests migration lost rows: expected ${before.count}, found ${after.count}`);
      }
      if (previousSequence) {
        const currentSequence = directoryDb
          .prepare("SELECT seq FROM sqlite_sequence WHERE name = 'requests'")
          .get() as { seq: number } | undefined;
        const sequence = Math.max(previousSequence.seq, currentSequence?.seq ?? 0);
        if (currentSequence) {
          directoryDb.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'requests'").run(sequence);
        } else {
          directoryDb.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('requests', ?)").run(sequence);
        }
      }
      const foreignKeyErrors = directoryDb.prepare("PRAGMA foreign_key_check(requests)").all();
      if (foreignKeyErrors.length > 0) {
        throw new Error("Requests migration failed foreign-key validation");
      }
      directoryDb.prepare("INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)").run(
        requestUnitMigrationName,
        new Date().toISOString(),
      );
      directoryDb.exec("COMMIT");
    } catch (error) {
      directoryDb.exec("ROLLBACK");
      throw error;
    }
  } else {
    directoryDb.prepare("INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)").run(
      requestUnitMigrationName,
      new Date().toISOString(),
    );
  }
}

const itemCategoryColumns = directoryDb
  .prepare("PRAGMA table_info(item_categories)")
  .all() as Array<{ name: string }>;
if (!itemCategoryColumns.some((column) => column.name === "parent_id")) {
  directoryDb.exec("ALTER TABLE item_categories ADD COLUMN parent_id INTEGER REFERENCES item_categories(id)");
}
if (!itemCategoryColumns.some((column) => column.name === "slug")) {
  directoryDb.exec("ALTER TABLE item_categories ADD COLUMN slug TEXT");
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
  CREATE TABLE IF NOT EXISTS supplier_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    whatsapp_clicks INTEGER NOT NULL DEFAULT 0,
    profile_views INTEGER NOT NULL DEFAULT 0,
    reviews_count INTEGER NOT NULL DEFAULT 0,
    average_rating REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE(supplier_id, date)
  );
  CREATE TABLE IF NOT EXISTS supplier_opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('opportunity', 'warning', 'tip')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
    created_at TEXT NOT NULL,
    UNIQUE(supplier_id, type, title)
  );
`);
const searchLogColumns = directoryDb.prepare("PRAGMA table_info(buyer_search_logs)").all() as Array<{ name: string }>;
if (!searchLogColumns.some((column) => column.name === "buyer_id")) {
  directoryDb.exec("ALTER TABLE buyer_search_logs ADD COLUMN buyer_id INTEGER REFERENCES buyer_users(id)");
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
const wasPermanentlyDeleted = directoryDb.prepare(
  "SELECT 1 FROM permanently_deleted_item_categories WHERE id = ?",
);
itemCategorySeed.forEach((item) => {
  if (!wasPermanentlyDeleted.get(item[0])) upsertItemCategory.run(...item);
});

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

const groupedItemCategoryContinuationSeed = [
  ["كريمة لوتس", "🍮", "الحشوات والكريمات", 51],
  ["كريمة فستق", "🍮", "الحشوات والكريمات", 52],
  ["كريمة نوتيلا", "🍫", "الحشوات والكريمات", 53],
  ["توفي كراميل", "🍮", "الحشوات والكريمات", 54],
  ["مربى مشمش", "🍑", "الحشوات والكريمات", 55],
  ["عسل", "🍯", "الحشوات والكريمات", 56],
  ["دبس تمر", "🍯", "الحشوات والكريمات", 57],
  ["دبس رمان", "🍯", "الحشوات والكريمات", 58],
  ["لوز", "🥜", "المكسرات والبذور", 59],
  ["كاجو", "🥜", "المكسرات والبذور", 60],
  ["فستق", "🥜", "المكسرات والبذور", 61],
  ["بندق", "🥜", "المكسرات والبذور", 62],
  ["جوز", "🥜", "المكسرات والبذور", 63],
  ["بيكان", "🥜", "المكسرات والبذور", 64],
  ["فول سوداني", "🥜", "المكسرات والبذور", 65],
  ["سمسم", "🌰", "المكسرات والبذور", 66],
  ["حبة البركة", "🌰", "المكسرات والبذور", 67],
  ["جوز الهند", "🥥", "المكسرات والبذور", 68],
  ["خميرة", "🧪", "المحسنات والخمائر", 69],
  ["محسن خبز", "🧪", "المحسنات والخمائر", 70],
  ["محسن كيك", "🧪", "المحسنات والخمائر", 71],
  ["بيكنج صودا", "🧪", "المحسنات والخمائر", 72],
  ["مانع عفن", "🧪", "المحسنات والخمائر", 73],
  ["فانيليا", "🌿", "النكهات والألوان", 74],
  ["نكهات", "🌿", "النكهات والألوان", 75],
  ["ألوان طعام", "🎨", "النكهات والألوان", 76],
  ["ألوان بودرة", "🎨", "النكهات والألوان", 77],
  ["عطور حلويات", "🌸", "النكهات والألوان", 78],
  ["مستخلصات", "🌿", "النكهات والألوان", 79],
  ["زعفران", "🌸", "النكهات والألوان", 80],
  ["هيل", "🌿", "النكهات والألوان", 81],
  ["قرفة", "🌿", "النكهات والألوان", 82],
  ["كمون", "🌿", "النكهات والألوان", 83],
  ["ينسون", "🌿", "النكهات والألوان", 84],
  ["سماق", "🌿", "النكهات والألوان", 85],
  ["زعتر", "🌿", "النكهات والألوان", 86],
  ["كركم", "🌿", "النكهات والألوان", 87],
  ["ملح ليمون", "🧂", "النكهات والألوان", 88],
  ["بسكويت لوتس", "🍪", "البسكويت والحلويات", 89],
  ["بسكويت أوريو", "🍪", "البسكويت والحلويات", 90],
] as const;

const groupedItemCategoryContinuationMigration = directoryDb.prepare(
  "SELECT name FROM directory_migrations WHERE name = ?",
).get("grouped-item-category-catalog-v2") as { name: string } | undefined;
if (!groupedItemCategoryContinuationMigration) {
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
    for (const [name, icon, groupName, displayOrder] of groupedItemCategoryContinuationSeed) {
      upsertItemCategory.run(name, icon, groupName, displayOrder, now, now);
    }
    directoryDb.prepare(`
      INSERT INTO directory_migrations (name, applied_at)
      VALUES ('grouped-item-category-catalog-v2', ?)
    `).run(now);
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
}

const groupedItemCategoryFinalSeed = [
  ["بسكويت أصابع", "🍪", "البسكويت والحلويات", 91],
  ["بسكويت فنجر", "🍪", "البسكويت والحلويات", 92],
  ["كرز أحمر", "🍒", "البسكويت والحلويات", 93],
  ["فواكه مشكلة", "🍇", "البسكويت والحلويات", 94],
  ["فواكه مجففة", "🍇", "البسكويت والحلويات", 95],
  ["عجين سمبوسة", "🥟", "العجائن والجاهز", 96],
  ["عجين بيتزا", "🍕", "العجائن والجاهز", 97],
  ["عجين كنافة", "🍮", "العجائن والجاهز", 98],
  ["عجين تمر", "🍯", "العجائن والجاهز", 99],
  ["خبز رقاق", "🫓", "العجائن والجاهز", 100],
  ["خبز جاهز", "🥖", "العجائن والجاهز", 101],
  ["معجنات مجمدة", "🥐", "العجائن والجاهز", 102],
  ["علب كيك", "📦", "التغليف والطباعة", 103],
  ["علب حلويات", "📦", "التغليف والطباعة", 104],
  ["علب بسبوسة", "📦", "التغليف والطباعة", 105],
  ["علب ورق عنب", "📦", "التغليف والطباعة", 106],
  ["علب لقيمات", "📦", "التغليف والطباعة", 107],
  ["أكياس كريمة", "🛍️", "التغليف والطباعة", 108],
  ["أكياس تغليف", "🛍️", "التغليف والطباعة", 109],
  ["أكياس مطبوعة", "🛍️", "التغليف والطباعة", 110],
  ["كراتين", "📦", "التغليف والطباعة", 111],
  ["قواعد كيك", "🎂", "التغليف والطباعة", 112],
  ["ورق زبدة", "📄", "التغليف والطباعة", 113],
  ["ورق سكر", "📄", "التغليف والطباعة", 114],
  ["ورق ويفر", "📄", "التغليف والطباعة", 115],
  ["ألمنيوم", "📄", "التغليف والطباعة", 116],
  ["سلوفان", "📄", "التغليف والطباعة", 117],
  ["رول تغليف", "📄", "التغليف والطباعة", 118],
  ["أدوات تزيين", "🎨", "أدوات التزيين", 119],
  ["رؤوس تزيين", "🎨", "أدوات التزيين", 120],
  ["ورق ذهب", "✨", "أدوات التزيين", 121],
  ["لولو كرات", "⚪", "أدوات التزيين", 122],
  ["فرمسلي", "✨", "أدوات التزيين", 123],
  ["حبر طابعة", "🖨️", "أدوات التزيين", 124],
  ["رشات لولو", "✨", "أدوات التزيين", 125],
  ["ماء ورد", "💧", "مواد أخرى", 126],
  ["ماء زهر", "💧", "مواد أخرى", 127],
  ["خل", "🧴", "مواد أخرى", 128],
  ["كاتشب", "🍅", "مواد أخرى", 129],
  ["مايونيز", "🥚", "مواد أخرى", 130],
  ["صوص بيتزا", "🍕", "مواد أخرى", 131],
  ["صوص حار", "🌶️", "مواد أخرى", 132],
] as const;

const groupedItemCategoryFinalMigration = directoryDb.prepare(
  "SELECT name FROM directory_migrations WHERE name = ?",
).get("grouped-item-category-catalog-v3") as { name: string } | undefined;
if (!groupedItemCategoryFinalMigration) {
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    const upsertFinalItemCategory = directoryDb.prepare(`
      INSERT INTO item_categories
        (name, icon, group_name, parent_id, description, display_on_home,
         display_order, is_active, created_at, updated_at)
      VALUES (?, ?, ?, NULL, NULL, 0, ?, 1, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        icon = excluded.icon,
        group_name = excluded.group_name,
        display_order = excluded.display_order,
        updated_at = excluded.updated_at
    `);
    for (const [name, icon, groupName, displayOrder] of groupedItemCategoryFinalSeed) {
      upsertFinalItemCategory.run(name, icon, groupName, displayOrder, now, now);
    }
    directoryDb.prepare(`
      INSERT INTO directory_migrations (name, applied_at)
      VALUES ('grouped-item-category-catalog-v3', ?)
    `).run(now);
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
}

const canonicalItemCategoryRoots = [
  ["المواد الأساسية", "basic-materials", "🌾"],
  ["منتجات الألبان", "dairy", "🥛"],
  ["الأجبان", "cheese", "🧀"],
  ["الشوكولاتة والكاكاو", "chocolate", "🍫"],
  ["المكسرات والبذور", "nuts", "🥜"],
  ["خلطات جاهزة", "cake-mixes", "🍰"],
  ["الخمائر والمحسنات", "yeast", "🧪"],
  ["النكهات والألوان", "flavors", "🌿"],
  ["العجائن والجاهز", "dough", "🥟"],
  ["التغليف والعلب", "packaging", "📦"],
  ["المعدات والأدوات", "equipment", "⚙️"],
  ["حشوات الكيك", "cake-fillings", "🍰"],
  ["مواد أخرى", "others", "🧴"],
] as const;
const taxonomyMigrationName = "three-level-item-category-taxonomy-v1";
const taxonomyMigration = directoryDb.prepare(
  "SELECT name FROM directory_migrations WHERE name = ?",
).get(taxonomyMigrationName) as { name: string } | undefined;

if (!taxonomyMigration) {
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    const rootIdBySlug = new Map<string, number>();
    const rootIdByName = new Map<string, number>();
    for (const [name, slug, icon] of canonicalItemCategoryRoots) {
      const existing = directoryDb.prepare(
        "SELECT id FROM item_categories WHERE name = ?",
      ).get(name) as { id: number } | undefined;
      let id: number;
      if (existing) {
        id = existing.id;
        directoryDb.prepare(`
          UPDATE item_categories
          SET icon = ?, group_name = ?, parent_id = NULL, display_on_home = 1,
              display_order = ?, is_active = 1, updated_at = ?
          WHERE id = ?
        `).run(icon, name, canonicalItemCategoryRoots.findIndex((root) => root[0] === name) + 1, now, id);
      } else {
        const result = directoryDb.prepare(`
          INSERT INTO item_categories
            (name, icon, group_name, parent_id, slug, display_on_home, display_order,
             is_active, created_at, updated_at)
          VALUES (?, ?, ?, NULL, ?, 1, ?, 1, ?, ?)
        `).run(
          name,
          icon,
          name,
          slug,
          canonicalItemCategoryRoots.findIndex((root) => root[0] === name) + 1,
          now,
          now,
        );
        id = Number(result.lastInsertRowid);
      }
      rootIdBySlug.set(slug, id);
      rootIdByName.set(name, id);
    }

    const categoriesBeforeReparent = directoryDb.prepare(`
      SELECT id, name, icon, group_name AS groupName, parent_id AS parentId,
        slug, is_active AS isActive, display_order AS displayOrder
      FROM item_categories ORDER BY id
    `).all() as Array<{
      id: number;
      name: string;
      icon: string;
      groupName: string;
      parentId: number | null;
      slug: string | null;
      isActive: number;
      displayOrder: number;
    }>;
    const canonicalRootIds = new Set(rootIdByName.values());
    const canonicalCakeFillingsId = rootIdBySlug.get("cake-fillings")!;
    const basicChildNames = new Set([
      "دقيق", "سكر", "سميد", "برغل", "نخالة", "سكر بودرة", "سكر بني",
    ]);
    const rootSlugForCategory = (category: (typeof categoriesBeforeReparent)[number]) => {
      if (canonicalRootIds.has(category.id)) return null;
      if (category.parentId === canonicalCakeFillingsId) return "cake-fillings";
      if (basicChildNames.has(category.name) || category.name === "سميد وبرغل") return "basic-materials";

      const name = category.name;
      const group = category.groupName;
      if (/حشوة|حشوات|كريمة لوتس|كريمة فستق|كريمة نوتيلا|توفي|مربى/.test(name) ||
          group.includes("الحشوات والكريمات")) return "cake-fillings";
      if (/شوكولاتة|كاكاو|غاناش|صوص شوكولاتة/.test(name)) return "chocolate";
      if (/جبن|أجبان/.test(name)) return "cheese";
      if (/لوز|كاجو|فستق|بندق|بيكان|فول سوداني|سمسم|حبة البركة|جوز|مكسرات|بذور/.test(name)) return "nuts";
      if (/حليب|قشطة|كريمة|لبنة|زبادي|لبن|زبدة|سمن حيواني|^سمن$/.test(name)) return "dairy";
      if (/مارجرين|دهون|زيت|شورتنج|سمن نباتي/.test(name)) return "others";
      if (/خميرة|محسن|بيكنج صودا|بيكنج بودر|مانع عفن/.test(name) ||
          group.includes("المحسنات") || group.includes("الخمائر")) return "yeast";
      if (/نكهة|نكهات|لون|ألوان|فانيليا|مستخلص|عطور|زعفران|هيل|قرفة|كمون|ينسون|سماق|زعتر|كركم|ملح ليمون/.test(name) ||
          group.includes("النكهات والألوان")) return "flavors";
      if (/عجين|خبز|معجنات/.test(name) || group.includes("العجائن والجاهز")) return "dough";
      if (/تغليف|علب|أكياس|كراتين|ورق|سلوفان|رول|ألمنيوم|طابعة|حبر/.test(name) ||
          group.includes("التغليف والطباعة")) return "packaging";
      if (/معدات|أفران|أدوات صغيرة|رؤوس تزيين|أدوات تزيين/.test(name) ||
          group.includes("المعدات") || group.includes("أدوات التزيين")) return "equipment";
      if (/خلطات/.test(name) || group.includes("مكونات الكيك")) return "cake-mixes";
      if (group.includes("المكسرات والبذور")) return "nuts";
      if (group.includes("مواد أخرى")) return "others";
      return "others";
    };

    const basicSpecificNames = ["دقيق", "سكر", "سميد", "برغل", "نخالة", "سكر بودرة", "سكر بني"];
    for (const name of basicSpecificNames) {
      const found = directoryDb.prepare(
        "SELECT id FROM item_categories WHERE name = ?",
      ).get(name) as { id: number } | undefined;
      if (!found) {
        const basicRootId = rootIdBySlug.get("basic-materials")!;
        const result = directoryDb.prepare(`
          INSERT INTO item_categories
            (name, icon, group_name, parent_id, display_on_home, display_order,
             is_active, created_at, updated_at)
          VALUES (?, '🌾', 'المواد الأساسية', ?, 0, 0, 1, ?, ?)
        `).run(name, basicRootId, now, now);
        categoriesBeforeReparent.push({
          id: Number(result.lastInsertRowid),
          name,
          icon: "🌾",
          groupName: "المواد الأساسية",
          parentId: basicRootId,
          slug: null,
          isActive: 1,
          displayOrder: 0,
        });
      }
    }

    const categoryOrderByRoot = new Map<string, number>();
    for (const category of categoriesBeforeReparent) {
      if (canonicalRootIds.has(category.id) || !category.isActive) continue;
      const rootSlug = rootSlugForCategory(category);
      if (!rootSlug) continue;
      const parentId = rootIdBySlug.get(rootSlug)!;
      if (category.name === "سميد وبرغل") {
        directoryDb.prepare(`
          UPDATE item_categories
          SET parent_id = ?, group_name = 'المواد الأساسية', is_active = 0,
              display_on_home = 0, updated_at = ?
          WHERE id = ?
        `).run(parentId, now, category.id);
        continue;
      }
      const nextOrder = (categoryOrderByRoot.get(rootSlug) ?? 0) + 1;
      categoryOrderByRoot.set(rootSlug, nextOrder);
      directoryDb.prepare(`
        UPDATE item_categories
        SET parent_id = ?, group_name = ?, display_on_home = 0,
            display_order = ?, updated_at = ?
        WHERE id = ?
      `).run(parentId, canonicalItemCategoryRoots.find((root) => root[1] === rootSlug)![0], nextOrder, now, category.id);
    }

    const basicRootId = rootIdBySlug.get("basic-materials")!;
    basicSpecificNames.forEach((name, index) => {
      directoryDb.prepare(`
        UPDATE item_categories
        SET parent_id = ?, group_name = 'المواد الأساسية', is_active = 1,
            display_on_home = 0, display_order = ?, updated_at = ?
        WHERE name = ?
      `).run(basicRootId, index + 1, now, name);
    });

    const compositeCategory = directoryDb.prepare(
      "SELECT id FROM item_categories WHERE name = ?",
    ).get("سميد وبرغل") as { id: number } | undefined;
    if (compositeCategory) {
      const categoryRequests = directoryDb.prepare(
        "SELECT id, categories FROM supplier_requests",
      ).all() as Array<{ id: number; categories: string }>;
      const updateRequestCategories = directoryDb.prepare(
        "UPDATE supplier_requests SET categories = ? WHERE id = ?",
      );
      for (const request of categoryRequests) {
        let selected: unknown;
        try {
          selected = JSON.parse(request.categories);
        } catch {
          continue;
        }
        if (!Array.isArray(selected) || !selected.includes("سميد وبرغل")) continue;
        const migrated = new Set<string>();
        for (const value of selected) {
          if (value === "سميد وبرغل") {
            migrated.add("سميد");
            migrated.add("برغل");
          } else if (typeof value === "string") {
            migrated.add(value);
          }
        }
        updateRequestCategories.run(JSON.stringify([...migrated]), request.id);
      }
      directoryDb.prepare(`
        UPDATE item_categories
        SET parent_id = ?, group_name = 'المواد الأساسية', is_active = 0,
            display_on_home = 0, updated_at = ?
        WHERE id = ?
      `).run(rootIdBySlug.get("basic-materials")!, now, compositeCategory.id);
    }

    const categoriesForSlugs = directoryDb.prepare(`
      SELECT id, name, slug FROM item_categories ORDER BY id
    `).all() as Array<{ id: number; name: string; slug: string | null }>;
    const rootSlugById = new Map([...rootIdBySlug].map(([slug, id]) => [id, slug]));
    const usedSlugs = new Set<string>(canonicalItemCategoryRoots.map((root) => root[1]));
    for (const category of categoriesForSlugs) {
      const canonicalRootSlug = rootSlugById.get(category.id);
      if (canonicalRootSlug) {
        directoryDb.prepare("UPDATE item_categories SET slug = ? WHERE id = ?")
          .run(canonicalRootSlug, category.id);
        continue;
      }
      let slug = category.slug?.trim() || itemCategorySlugBase(category.name);
      if (usedSlugs.has(slug)) slug = `${slug}-${category.id}`;
      let collisionSuffix = 2;
      const fallbackBase = `${itemCategorySlugBase(category.name)}-${category.id}`;
      while (usedSlugs.has(slug)) {
        slug = `${fallbackBase}-${collisionSuffix}`;
        collisionSuffix += 1;
      }
      usedSlugs.add(slug);
      directoryDb.prepare("UPDATE item_categories SET slug = ? WHERE id = ?").run(slug, category.id);
    }

    directoryDb.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_item_categories_slug
      ON item_categories (slug);
    `);
    directoryDb.prepare(`
      INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)
    `).run(taxonomyMigrationName, now);
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
}

directoryDb.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_item_categories_slug
  ON item_categories (slug);
`);

const groupTagTaxonomyMigrationName = "group-tag-primary-category-taxonomy-v1";
const groupTagTaxonomyMigration = directoryDb.prepare(
  "SELECT name FROM directory_migrations WHERE name = ?",
).get(groupTagTaxonomyMigrationName) as { name: string } | undefined;
if (!groupTagTaxonomyMigration) {
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    directoryDb.exec(`
      CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        slug TEXT NOT NULL UNIQUE,
        icon TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
      );
      CREATE TABLE IF NOT EXISTS category_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL REFERENCES item_categories(id) ON DELETE CASCADE,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        UNIQUE (category_id, group_id)
      );
    `);
    const itemCategoryColumns = directoryDb.prepare(
      "PRAGMA table_info(item_categories)",
    ).all() as Array<{ name: string }>;
    if (!itemCategoryColumns.some((column) => column.name === "primary_group_id")) {
      directoryDb.exec(`
        ALTER TABLE item_categories
        ADD COLUMN primary_group_id INTEGER REFERENCES groups(id)
      `);
    }

    const insertGroup = directoryDb.prepare(`
      INSERT INTO groups (id, name, slug, icon, display_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        slug = excluded.slug,
        icon = excluded.icon,
        display_order = excluded.display_order,
        is_active = excluded.is_active
    `);
    for (const [name, slug] of canonicalItemCategoryRoots) {
      const root = directoryDb.prepare(`
        SELECT id, name, slug, icon, display_order AS displayOrder, is_active AS isActive
        FROM item_categories
        WHERE slug = ? AND parent_id IS NULL AND is_active = 1
      `).get(slug) as {
        id: number;
        name: string;
        slug: string;
        icon: string;
        displayOrder: number;
        isActive: number;
      } | undefined;
      if (!root || root.name !== name) {
        throw new Error(`Cannot seed taxonomy group ${slug}: its canonical root is missing or changed.`);
      }
      insertGroup.run(root.id, root.name, root.slug, root.icon, root.displayOrder, root.isActive);
    }

    const groups = directoryDb.prepare(`
      SELECT id, name, slug FROM groups
    `).all() as Array<{ id: number; name: string; slug: string }>;
    const groupById = new Map(groups.map((group) => [group.id, group]));
    const canonicalRootIds = new Set(groupById.keys());
    const fallbackGroup = groups.find((group) => group.slug === "others");
    if (!fallbackGroup) throw new Error("Cannot flatten legacy item categories: canonical others group is missing.");
    const legacyCategories = directoryDb.prepare(`
      SELECT id, parent_id AS parentId FROM item_categories
    `).all() as Array<{ id: number; parentId: number | null }>;
    const parentIdByCategory = new Map(legacyCategories.map((category) => [category.id, category.parentId]));
    const updateCategoryGroup = directoryDb.prepare(`
      UPDATE item_categories
      SET parent_id = ?, primary_group_id = ?, group_name = ?
      WHERE id = ?
    `);
    for (const category of legacyCategories) {
      if (canonicalRootIds.has(category.id)) {
        const group = groupById.get(category.id)!;
        updateCategoryGroup.run(null, null, group.name, category.id);
        continue;
      }

      let ancestorId = category.parentId;
      let canonicalGroup: typeof fallbackGroup | undefined;
      const visited = new Set<number>([category.id]);
      while (ancestorId !== null && !visited.has(ancestorId)) {
        if (canonicalRootIds.has(ancestorId)) {
          canonicalGroup = groupById.get(ancestorId);
          break;
        }
        visited.add(ancestorId);
        ancestorId = parentIdByCategory.get(ancestorId) ?? null;
      }
      const group = canonicalGroup ?? fallbackGroup;
      updateCategoryGroup.run(group.id, group.id, group.name, category.id);
    }

    directoryDb.exec(`
      CREATE INDEX IF NOT EXISTS idx_item_categories_primary_group_id
      ON item_categories (primary_group_id);
      CREATE INDEX IF NOT EXISTS idx_category_tags_group_id
      ON category_tags (group_id);
      CREATE INDEX IF NOT EXISTS idx_category_tags_category_id
      ON category_tags (category_id);
    `);
    directoryDb.prepare(`
      INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)
    `).run(groupTagTaxonomyMigrationName, now);
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
}

const itemCategoryAliasMigrationName = "stable-item-category-alias-ids-v1";
const itemCategoryAliasMigration = directoryDb.prepare(
  "SELECT name FROM directory_migrations WHERE name = ?",
).get(itemCategoryAliasMigrationName) as { name: string } | undefined;
if (!itemCategoryAliasMigration) {
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    const categories = directoryDb.prepare(`
      SELECT id, name FROM item_categories
    `).all() as Array<{ id: number; name: string }>;
    const categoryIdByName = new Map(categories.map((category) => [category.name, category.id]));
    const insertAlias = directoryDb.prepare(`
      INSERT OR IGNORE INTO item_category_aliases (alias, item_category_id)
      VALUES (?, ?)
    `);
    for (const [alias, targetNames] of Object.entries(legacyItemCategoryAliasTargets)) {
      for (const targetName of targetNames) {
        const itemCategoryId = categoryIdByName.get(targetName);
        if (itemCategoryId === undefined) {
          throw new Error(`Cannot seed item-category alias ${alias}: target ${targetName} is missing.`);
        }
        insertAlias.run(alias, itemCategoryId);
      }
    }
    directoryDb.prepare(`
      INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)
    `).run(itemCategoryAliasMigrationName, now);
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
}

const supplierCategoryMappingMigrationName = "normalized-supplier-item-categories-v1";
const supplierCategoryMappingMigration = directoryDb.prepare(
  "SELECT name FROM directory_migrations WHERE name = ?",
).get(supplierCategoryMappingMigrationName) as { name: string } | undefined;
if (!supplierCategoryMappingMigration) {
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    const categories = directoryDb.prepare(`
      SELECT id, name FROM item_categories
    `).all() as Array<{ id: number; name: string }>;
    const stableAliases = directoryDb.prepare(`
      SELECT alias, item_category_id AS itemCategoryId FROM item_category_aliases
    `).all() as Array<{ alias: string; itemCategoryId: number }>;
    const linkedRequests = directoryDb.prepare(`
      SELECT s.id AS supplierId, sr.categories
      FROM suppliers s
      JOIN supplier_requests sr ON sr.id = s.request_id
      WHERE sr.status = 'approved'
    `).all() as Array<{ supplierId: number; categories: string }>;
    const insert = directoryDb.prepare(`
      INSERT OR IGNORE INTO supplier_categories (supplier_id, item_category_id)
      VALUES (?, ?)
    `);
    directoryDb.exec("DELETE FROM supplier_categories");
    for (const linkedRequest of linkedRequests) {
      let selected: unknown;
      try {
        selected = JSON.parse(linkedRequest.categories);
      } catch {
        continue;
      }
      if (!Array.isArray(selected)) continue;
      const categoryIds = resolveDirectItemCategoryIdsForSelections(
        selected.filter((name): name is string => typeof name === "string"),
        categories,
        stableAliases,
      );
      for (const categoryId of categoryIds) insert.run(linkedRequest.supplierId, categoryId);
    }
    directoryDb.prepare(`
      INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)
    `).run(supplierCategoryMappingMigrationName, now);
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

const cakeSupplyRestructureMigrationName = "cake-supplies-subgroups-v1";
const cakeSupplyRestructureMigration = directoryDb.prepare(
  "SELECT name FROM directory_migrations WHERE name = ?",
).get(cakeSupplyRestructureMigrationName) as { name: string } | undefined;
if (!cakeSupplyRestructureMigration) {
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    const groupColumns = directoryDb.prepare("PRAGMA table_info(groups)").all() as Array<{ name: string }>;
    if (!groupColumns.some((column) => column.name === "parent_id")) {
      directoryDb.exec("ALTER TABLE groups ADD COLUMN parent_id INTEGER REFERENCES groups(id)");
    }
    const categoryColumns = directoryDb.prepare("PRAGMA table_info(item_categories)").all() as Array<{ name: string }>;
    if (!categoryColumns.some((column) => column.name === "sub_group_id")) {
      directoryDb.exec("ALTER TABLE item_categories ADD COLUMN sub_group_id INTEGER REFERENCES groups(id)");
    }
    const oldRoots = directoryDb.prepare(`
      SELECT id, slug FROM groups WHERE slug IN ('cake-mixes', 'cake-fillings', 'others')
    `).all() as Array<{ id: number; slug: string }>;
    if (oldRoots.length !== 3) {
      throw new Error("Cannot restructure cake supplies: one or more legacy roots are missing.");
    }
    const oldRootIds = new Map(oldRoots.map((row) => [row.slug, row.id]));
    const cakeRootId = (directoryDb.prepare(`
      SELECT COALESCE(MAX(id), 0) + 1 AS id FROM (
        SELECT id FROM groups
        UNION ALL SELECT id FROM item_categories
        UNION ALL SELECT id FROM permanently_deleted_item_categories
      )
    `).get() as { id: number }).id;
    const subgroupSpecs = [
      ["خلطات جاهزة", "mixes", "🍰"],
      ["حشوات وكريمات", "fillings", "🍓"],
      ["أدوات تزيين", "decorations", "🎨"],
      ["قوالب كيك", "molds", "🎂"],
      ["ورق وقواعد", "paper", "📄"],
      ["مواد خام ومتنوعات", "raw-misc", "🧴"],
    ] as const;
    directoryDb.prepare(`
      INSERT INTO groups (id, name, slug, icon, display_order, is_active, parent_id)
      VALUES (?, 'مستلزمات الكيك والحلويات', 'cake-supplies', '🎂', 6, 1, NULL)
    `).run(cakeRootId);
    directoryDb.prepare(`
      INSERT INTO item_categories
        (id, name, icon, group_name, parent_id, slug, description, display_on_home,
         display_order, is_active, created_at, updated_at, primary_group_id, sub_group_id)
      VALUES (?, 'مستلزمات الكيك والحلويات', '🎂', 'مستلزمات الكيك والحلويات', NULL, 'cake-supplies',
        NULL, 1, 6, 1, ?, ?, NULL, NULL)
    `).run(cakeRootId, now, now);
    const addLegacyRootAlias = directoryDb.prepare(`
      INSERT OR IGNORE INTO item_category_aliases (alias, item_category_id)
      VALUES (?, ?)
    `);
    for (const alias of ["خلطات جاهزة", "خلطات قسم الكيك الجاهزة", "حشوات الكيك", "مواد أخرى"]) {
      addLegacyRootAlias.run(alias, cakeRootId);
    }

    const subgroupIds = new Map<string, number>();
    directoryDb.prepare(`
      UPDATE groups SET
        name = CASE WHEN slug = 'cake-mixes' THEN 'خلطات الكيك القديمة' ELSE name END,
        is_active = 0, display_order = 0
      WHERE id IN (?, ?, ?)
    `).run(oldRootIds.get("cake-mixes")!, oldRootIds.get("cake-fillings")!, oldRootIds.get("others")!);
    let nextId = cakeRootId + 1;
    for (const [name, slug, icon] of subgroupSpecs) {
      subgroupIds.set(slug, nextId);
      directoryDb.prepare(`
        INSERT INTO groups (id, name, slug, icon, display_order, is_active, parent_id)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `).run(nextId, name, slug, icon, subgroupSpecs.findIndex((item) => item[1] === slug) + 1, cakeRootId);
      nextId += 1;
    }
    const updateCategory = directoryDb.prepare(`
      UPDATE item_categories
      SET parent_id = ?, primary_group_id = ?, sub_group_id = ?, group_name = ?,
          display_on_home = 0, updated_at = ?
      WHERE id = ?
    `);
    for (const [legacyRootSlug, subgroupSlug] of [
      ["cake-mixes", "mixes"],
      ["cake-fillings", "fillings"],
      ["others", "raw-misc"],
    ] as const) {
      updateCategory.run(
        cakeRootId,
        cakeRootId,
        subgroupIds.get(subgroupSlug)!,
        "مستلزمات الكيك والحلويات",
        now,
        oldRootIds.get(legacyRootSlug)!,
      );
      directoryDb.prepare(`
        UPDATE item_categories SET is_active = 1 WHERE id = ?
      `).run(oldRootIds.get(legacyRootSlug)!);
    }
    const subgroupByOldRoot = new Map<number, string>([
      [oldRootIds.get("cake-mixes")!, "mixes"],
      [oldRootIds.get("cake-fillings")!, "fillings"],
      [oldRootIds.get("others")!, "raw-misc"],
    ]);
    const oldRootChildren = directoryDb.prepare(`
      SELECT id, primary_group_id AS primaryGroupId
      FROM item_categories
      WHERE primary_group_id IN (?, ?, ?) AND parent_id IS NOT NULL
    `).all(oldRootIds.get("cake-mixes")!, oldRootIds.get("cake-fillings")!, oldRootIds.get("others")!) as Array<{
      id: number;
      primaryGroupId: number;
    }>;
    for (const category of oldRootChildren) {
      const subgroupSlug = subgroupByOldRoot.get(category.primaryGroupId) ?? "raw-misc";
      updateCategory.run(
        cakeRootId,
        cakeRootId,
        subgroupIds.get(subgroupSlug)!,
        "مستلزمات الكيك والحلويات",
        now,
        category.id,
      );
    }

    const namedSubgroupMappings: Array<[string, string, string]> = [
      ["خلطات كيك", "mixes", "🍰"],
      ["أدوات تزيين", "decorations", "🎨"], ["رؤوس تزيين", "decorations", "🎂"],
      ["ورق ذهب", "decorations", "✨"], ["لولو كرات", "decorations", "⚪"],
      ["فرمسلي", "decorations", "✨"], ["حبر طابعة", "decorations", "🖨️"],
      ["رشات لولو", "decorations", "✨"],
      ["قوالب كيك دائرية", "molds", "🎂"], ["قوالب كيك مربعة", "molds", "🎂"],
      ["قوالب كيك مستطيلة", "molds", "🎂"],
      ["ورق كيك", "paper", "📄"], ["قواعد كيك", "paper", "📄"],
      ["ورق زبدة", "paper", "📄"], ["ورق سكر", "paper", "📄"],
      ["ورق ويفر", "paper", "📄"],
    ];
    for (const [categoryName, subgroupSlug, icon] of namedSubgroupMappings) {
      const category = directoryDb.prepare(
        "SELECT id FROM item_categories WHERE name = ?",
      ).get(categoryName) as { id: number } | undefined;
      if (category) {
        updateCategory.run(
          cakeRootId,
          cakeRootId,
          subgroupIds.get(subgroupSlug)!,
          "مستلزمات الكيك والحلويات",
          now,
          category.id,
        );
      } else {
        const id = nextId;
        nextId += 1;
        const baseSlug = itemCategorySlugBase(categoryName);
        let slug = baseSlug;
        let suffix = 1;
        while (directoryDb.prepare(`
          SELECT 1 FROM item_categories WHERE slug = ?
          UNION ALL SELECT 1 FROM groups WHERE slug = ?
          LIMIT 1
        `).get(slug, slug)) {
          slug = `${baseSlug}-${id}${suffix > 1 ? `-${suffix}` : ""}`;
          suffix += 1;
        }
        directoryDb.prepare(`
          INSERT INTO item_categories
            (id, name, icon, group_name, parent_id, slug, description, display_on_home,
             display_order, is_active, created_at, updated_at, primary_group_id, sub_group_id)
          VALUES (?, ?, ?, 'مستلزمات الكيك والحلويات', ?, ?, NULL, 0, 1, 1, ?, ?, ?, ?)
        `).run(
          id,
          categoryName,
          icon,
          cakeRootId,
          slug,
          now,
          now,
          cakeRootId,
          subgroupIds.get(subgroupSlug)!,
        );
      }
    }
    for (const [slug, oldName, newName] of [
      ["dairy", "منتجات الألبان", "الحليب ومشتقاته"],
      ["dough", "العجائن والجاهز", "العجائن والمخبوزات"],
    ] as const) {
      const renamedRoot = directoryDb.prepare(
        "SELECT id FROM groups WHERE slug = ? AND parent_id IS NULL",
      ).get(slug) as { id: number } | undefined;
      if (!renamedRoot) throw new Error(`Cannot rename missing category root: ${slug}`);
      directoryDb.prepare("UPDATE groups SET name = ? WHERE id = ?").run(newName, renamedRoot.id);
      directoryDb.prepare(`
        UPDATE item_categories SET name = ?, group_name = ?, updated_at = ?
        WHERE id = ? AND parent_id IS NULL
      `).run(newName, newName, now, renamedRoot.id);
      directoryDb.prepare(`
        UPDATE item_categories SET group_name = ?, updated_at = ?
        WHERE primary_group_id = ?
      `).run(newName, now, renamedRoot.id);
      addLegacyRootAlias.run(oldName, renamedRoot.id);
    }
    directoryDb.exec(`
      CREATE INDEX IF NOT EXISTS idx_groups_parent_id ON groups (parent_id);
      CREATE INDEX IF NOT EXISTS idx_item_categories_sub_group_id ON item_categories (sub_group_id);
    `);
    directoryDb.prepare(`
      INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)
    `).run(cakeSupplyRestructureMigrationName, now);
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
}

const requestedCakeSupplyCategoriesMigrationName = "requested-cake-supply-categories-v1";
const requestedCakeSupplyCategoriesMigration = directoryDb.prepare(
  "SELECT name FROM directory_migrations WHERE name = ?",
).get(requestedCakeSupplyCategoriesMigrationName) as { name: string } | undefined;
if (!requestedCakeSupplyCategoriesMigration) {
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    const root = directoryDb.prepare(`
      SELECT id, name FROM groups WHERE slug = 'cake-supplies' AND is_active = 1 AND parent_id IS NULL
    `).get() as { id: number; name: string } | undefined;
    if (!root) throw new Error("Cannot seed requested cake categories: active cake-supplies root is missing.");
    const subgroupIds = new Map(
      (directoryDb.prepare(`
        SELECT id, slug FROM groups WHERE parent_id = ? AND is_active = 1
      `).all(root.id) as Array<{ id: number; slug: string }>).map((group) => [group.slug, group.id]),
    );
    const requestedCategories: Array<[string, string, string]> = [
      ["خلطات كيك", "mixes", "🍰"],
      ["أدوات تزيين", "decorations", "🎨"], ["رؤوس تزيين", "decorations", "🎂"],
      ["ورق ذهب", "decorations", "✨"], ["لولو كرات", "decorations", "⚪"],
      ["فرمسلي", "decorations", "✨"], ["حبر طابعة", "decorations", "🖨️"],
      ["رشات لولو", "decorations", "✨"],
      ["قوالب كيك دائرية", "molds", "🎂"], ["قوالب كيك مربعة", "molds", "🎂"],
      ["قوالب كيك مستطيلة", "molds", "🎂"],
      ["ورق كيك", "paper", "📄"], ["قواعد كيك", "paper", "📄"],
      ["ورق زبدة", "paper", "📄"], ["ورق سكر", "paper", "📄"],
      ["ورق ويفر", "paper", "📄"],
    ];
    let nextId = (directoryDb.prepare(`
      SELECT COALESCE(MAX(id), 0) + 1 AS id FROM (
        SELECT id FROM groups
        UNION ALL SELECT id FROM item_categories
        UNION ALL SELECT id FROM permanently_deleted_item_categories
      )
    `).get() as { id: number }).id;
    for (const [name, subgroupSlug, icon] of requestedCategories) {
      if (directoryDb.prepare("SELECT id FROM item_categories WHERE name = ?").get(name)) continue;
      const subgroupId = subgroupIds.get(subgroupSlug);
      if (subgroupId === undefined) throw new Error(`Cannot seed category ${name}: subgroup ${subgroupSlug} is missing.`);
      const id = nextId++;
      const baseSlug = itemCategorySlugBase(name);
      let slug = baseSlug;
      let suffix = 1;
      while (directoryDb.prepare(`
        SELECT 1 FROM item_categories WHERE slug = ?
        UNION ALL SELECT 1 FROM groups WHERE slug = ?
        LIMIT 1
      `).get(slug, slug)) {
        slug = `${baseSlug}-${id}${suffix > 1 ? `-${suffix}` : ""}`;
        suffix += 1;
      }
      directoryDb.prepare(`
        INSERT INTO item_categories
          (id, name, icon, group_name, parent_id, slug, description, display_on_home,
           display_order, is_active, created_at, updated_at, primary_group_id, sub_group_id)
        VALUES (?, ?, ?, ?, ?, ?, NULL, 0, 1, 1, ?, ?, ?, ?)
      `).run(id, name, icon, root.name, root.id, slug, now, now, root.id, subgroupId);
    }
    directoryDb.prepare(`
      INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)
    `).run(requestedCakeSupplyCategoriesMigrationName, now);
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
}

const legacyCakeRootCategoryMigrationName = "legacy-cake-root-category-paths-v1";
const legacyCakeRootCategoryMigration = directoryDb.prepare(
  "SELECT name FROM directory_migrations WHERE name = ?",
).get(legacyCakeRootCategoryMigrationName) as { name: string } | undefined;
if (!legacyCakeRootCategoryMigration) {
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    const root = directoryDb.prepare(`
      SELECT id, name FROM groups WHERE slug = 'cake-supplies' AND parent_id IS NULL
    `).get() as { id: number; name: string } | undefined;
    if (!root) throw new Error("Cannot preserve legacy cake category paths: cake-supplies root is missing.");
    const legacyRows = [
      ["cake-mixes", "mixes"],
      ["cake-fillings", "fillings"],
      ["others", "raw-misc"],
    ] as const;
    for (const [legacySlug, subgroupSlug] of legacyRows) {
      const legacyGroup = directoryDb.prepare(
        "SELECT id FROM groups WHERE slug = ?",
      ).get(legacySlug) as { id: number } | undefined;
      const subgroup = directoryDb.prepare(
        "SELECT id FROM groups WHERE slug = ? AND parent_id = ?",
      ).get(subgroupSlug, root.id) as { id: number } | undefined;
      if (!legacyGroup || !subgroup) {
        throw new Error(`Cannot preserve legacy category path ${legacySlug}: its group/subgroup is missing.`);
      }
      directoryDb.prepare(`
        UPDATE item_categories
        SET parent_id = ?, primary_group_id = ?, sub_group_id = ?, group_name = ?,
            is_active = 1, display_on_home = 0, updated_at = ?
        WHERE id = ? AND parent_id IS NULL
      `).run(root.id, root.id, subgroup.id, root.name, now, legacyGroup.id);
    }
    directoryDb.prepare(`
      INSERT INTO directory_migrations (name, applied_at) VALUES (?, ?)
    `).run(legacyCakeRootCategoryMigrationName, now);
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
      google_rating,
      average_rating,
      0
    )
    ${where}
  `);
  supplierId ? statement.run(supplierId) : statement.run();
}

refreshSupplierRatings();