import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { directoryDb } from "./directory-db";

export type TestModeRole = "supplier" | "buyer";

const testModeCookieName = "bakery_test_mode";
const testModeDurationSeconds = 60 * 60 * 12;
const testAccounts = {
  supplier: { phone: "0500000001", name: "مورد تجريبي" },
  buyer: { phone: "0500000002", name: "صاحب عمل تجريبي" },
} as const;

directoryDb.exec(`
  CREATE TABLE IF NOT EXISTS test_mode_accounts (
    role TEXT PRIMARY KEY CHECK (role IN ('supplier', 'buyer')),
    entity_id INTEGER NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );
`);

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return secret;
}

function signature(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}

export function getTestModeSession(req: Request) {
  const token = req.cookies?.[testModeCookieName];
  if (typeof token !== "string") return null;
  const separator = token.lastIndexOf(".");
  if (separator < 1) return null;
  const payload = token.slice(0, separator);
  const provided = token.slice(separator + 1);
  const [role, idText, expiresText] = payload.split(":");
  const id = Number(idText);
  const expiresAt = Number(expiresText);
  if ((role !== "supplier" && role !== "buyer") || !Number.isSafeInteger(id) || id <= 0 ||
      !Number.isSafeInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000) || !provided) return null;
  const expected = signature(payload);
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) return null;
  if (!isTestModeAccount(role, id)) return null;
  return { role: role as TestModeRole, id };
}

export function isTestModeRequest(req: Request, role?: TestModeRole, id?: number) {
  const session = getTestModeSession(req);
  if (!session || (role && session.role !== role) || (id !== undefined && session.id !== id)) return false;
  return true;
}

export function isTestModeAccount(role: TestModeRole, id: number) {
  return Boolean(directoryDb.prepare(
    "SELECT 1 FROM test_mode_accounts WHERE role = ? AND entity_id = ?",
  ).get(role, id));
}

export function setTestModeSession(res: Response, role: TestModeRole, id: number) {
  const expiresAt = Math.floor(Date.now() / 1000) + testModeDurationSeconds;
  const payload = `${role}:${id}:${expiresAt}`;
  res.cookie(testModeCookieName, `${payload}.${signature(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: testModeDurationSeconds * 1000,
    path: "/",
  });
}

export function clearTestModeSession(res: Response) {
  res.clearCookie(testModeCookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

function randomPasswordHash() {
  const salt = randomBytes(16);
  const hash = scryptSync(randomBytes(32).toString("hex"), salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function accountConflict(role: TestModeRole): Error {
  return new Error(`TEST_MODE_ACCOUNT_CONFLICT:${role}:${testAccounts[role].phone}`);
}

export function ensureTestModeAccounts() {
  const setup = directoryDb.transaction(() => {
    for (const role of ["supplier", "buyer"] as const) {
      const expectedPhone = testAccounts[role].phone;
      const known = directoryDb.prepare(
        "SELECT entity_id AS entityId, phone FROM test_mode_accounts WHERE role = ?",
      ).get(role) as { entityId: number; phone: string } | undefined;
      if (known) {
        if (known.phone !== expectedPhone) throw accountConflict(role);
        const present = role === "supplier"
          ? directoryDb.prepare("SELECT 1 FROM suppliers s JOIN supplier_users su ON su.supplier_id = s.id WHERE s.id = ? AND su.phone = ?").get(known.entityId, expectedPhone)
          : directoryDb.prepare("SELECT 1 FROM buyer_users WHERE id = ? AND phone = ?").get(known.entityId, expectedPhone);
        if (!present) throw accountConflict(role);
        continue;
      }
      const conflicting = role === "supplier"
        ? directoryDb.prepare("SELECT 1 FROM supplier_users WHERE phone = ? LIMIT 1").get(expectedPhone)
        : directoryDb.prepare("SELECT 1 FROM buyer_users WHERE phone = ? LIMIT 1").get(expectedPhone);
      if (conflicting) throw accountConflict(role);
    }

    const now = new Date().toISOString();
    const supplierAccount = directoryDb.prepare(
      "SELECT entity_id AS entityId FROM test_mode_accounts WHERE role = 'supplier'",
    ).get() as { entityId: number } | undefined;
    if (!supplierAccount) {
      const plan = directoryDb.prepare("SELECT id FROM plans ORDER BY id LIMIT 1").get() as { id: number } | undefined;
      if (!plan) throw new Error("لم يتم إعداد أي باقة للموردين.");
      const supplierResult = directoryDb.prepare(`
        INSERT INTO suppliers
          (name, city, region, description, phone, whatsapp, address, is_verified,
           plan_id, max_products_allowed, is_featured, added_via, created_at, is_active)
        VALUES (?, 'الدمام', 'المنطقة الشرقية', ?, ?, ?, 'بيانات تجريبية غير منشورة', 0,
          ?, 3, 0, 'test_mode', ?, 0)
      `).run(
        testAccounts.supplier.name,
        "حساب تجريبي لمعاينة لوحة المورد فقط. هذه البيانات افتراضية وليست نشاطاً تجارياً حقيقياً.",
        testAccounts.supplier.phone,
        testAccounts.supplier.phone,
        plan.id,
        now,
      );
      const supplierId = Number(supplierResult.lastInsertRowid);
      directoryDb.prepare(`
        INSERT INTO supplier_users (supplier_id, phone, password_hash, status, created_at)
        VALUES (?, ?, ?, 'active', ?)
      `).run(supplierId, testAccounts.supplier.phone, randomPasswordHash(), now);
      directoryDb.prepare(`
        INSERT INTO test_mode_accounts (role, entity_id, phone, created_at)
        VALUES ('supplier', ?, ?, ?)
      `).run(supplierId, testAccounts.supplier.phone, now);

      const addCategory = directoryDb.prepare(`
        INSERT OR IGNORE INTO supplier_categories (supplier_id, item_category_id)
        SELECT ?, id FROM item_categories WHERE id = ?
      `);
      for (const itemCategoryId of [5, 6, 49]) addCategory.run(supplierId, itemCategoryId);

      const productCategory = directoryDb.prepare("SELECT id FROM categories ORDER BY id LIMIT 1").get() as { id: number } | undefined;
      if (productCategory) {
        directoryDb.prepare(`
          INSERT INTO products
            (supplier_id, category_id, name, weight, unit, country_of_origin, ingredients,
             technical_data, recommended_use, shelf_life, storage_conditions, min_order,
             image_url, sort_order, created_at)
          VALUES (?, ?, 'عينة منتج للمعاينة', '١٠', 'كجم', 'بيانات تجريبية',
            'بيانات توضيحية فقط', 'بيانات توضيحية فقط', 'للمعاينة', 'غير محدد',
            'غير محدد', 1, NULL, 0, ?)
        `).run(supplierId, productCategory.id, now);
      }
    }

    const buyerAccount = directoryDb.prepare(
      "SELECT entity_id AS entityId FROM test_mode_accounts WHERE role = 'buyer'",
    ).get() as { entityId: number } | undefined;
    if (!buyerAccount) {
      const buyerResult = directoryDb.prepare(`
        INSERT INTO buyer_users
          (full_name, phone, email, city, business_type, business_name, is_owner,
           job_title, password_hash, created_at, last_login, moderation_status)
        VALUES (?, ?, NULL, 'الدمام', 'مخبز', 'مخبز تجريبي', 1, NULL, ?, ?, ?, 'active')
      `).run(
        testAccounts.buyer.name,
        testAccounts.buyer.phone,
        randomPasswordHash(),
        now,
        now,
      );
      directoryDb.prepare(`
        INSERT INTO test_mode_accounts (role, entity_id, phone, created_at)
        VALUES ('buyer', ?, ?, ?)
      `).run(Number(buyerResult.lastInsertRowid), testAccounts.buyer.phone, now);
    }
  });

  try {
    directoryDb.exec("BEGIN IMMEDIATE");
    setup();
    directoryDb.exec("COMMIT");
  } catch (error) {
    if (directoryDb.isTransaction) directoryDb.exec("ROLLBACK");
    throw error;
  }
  return listTestModeAccounts();
}

export function listTestModeAccounts() {
  return (["supplier", "buyer"] as const).map((role) => {
    const row = directoryDb.prepare(`
      SELECT entity_id AS id, phone FROM test_mode_accounts WHERE role = ?
    `).get(role) as { id: number; phone: string } | undefined;
    if (!row) return { role, id: 0, name: testAccounts[role].name, phone: testAccounts[role].phone, ready: false, route: role === "supplier" ? "/supplier/dashboard" : "/buyer/profile" };
    const nameRow = role === "supplier"
      ? directoryDb.prepare("SELECT name FROM suppliers WHERE id = ?").get(row.id) as { name: string } | undefined
      : directoryDb.prepare("SELECT full_name AS name FROM buyer_users WHERE id = ?").get(row.id) as { name: string } | undefined;
    return {
      role,
      id: row.id,
      name: nameRow?.name ?? testAccounts[role].name,
      phone: row.phone,
      ready: Boolean(nameRow),
      route: role === "supplier" ? "/supplier/dashboard" : "/buyer/profile",
    };
  });
}

export function buildTestModeReport() {
  const databaseVersion = (directoryDb.prepare("SELECT sqlite_version() AS version").get() as { version: string }).version;
  const activeSuppliers = (directoryDb.prepare("SELECT COUNT(*) AS total FROM suppliers WHERE is_active = 1").get() as { total: number }).total;
  const incompleteDescriptions = (directoryDb.prepare(`
    SELECT COUNT(*) AS total FROM suppliers
    WHERE is_active = 1 AND length(trim(description)) < 60
  `).get() as { total: number }).total;
  const productsWithoutImages = (directoryDb.prepare(`
    SELECT COUNT(*) AS total FROM products p
    JOIN suppliers s ON s.id = p.supplier_id AND s.is_active = 1
    WHERE p.image_url IS NULL OR trim(p.image_url) = ''
  `).get() as { total: number }).total;
  const activeProducts = (directoryDb.prepare(`
    SELECT COUNT(*) AS total FROM products p
    JOIN suppliers s ON s.id = p.supplier_id AND s.is_active = 1
  `).get() as { total: number }).total;
  const inactiveDemoSuppliers = (directoryDb.prepare(`
    SELECT COUNT(*) AS total FROM test_mode_accounts t
    JOIN suppliers s ON s.id = t.entity_id
    WHERE t.role = 'supplier' AND s.is_active = 0
  `).get() as { total: number }).total;
  const accounts = listTestModeAccounts();
  const accountReady = accounts.every((account) => account.ready);
  const checks = [
    {
      key: "database",
      label: "اتصال قاعدة البيانات",
      status: "pass" as const,
      detail: `قاعدة SQLite متاحة، الإصدار ${databaseVersion}.`,
    },
    {
      key: "test-accounts",
      label: "حسابا المعاينة",
      status: accountReady ? "pass" as const : "fail" as const,
      detail: `الحسابات الجاهزة: ${accounts.filter((account) => account.ready).length} من ${accounts.length}.`,
    },
    {
      key: "demo-isolation",
      label: "عزل المورد التجريبي",
      status: inactiveDemoSuppliers === 1 ? "pass" as const : "fail" as const,
      detail: `المورد التجريبي غير منشور في الدليل: ${inactiveDemoSuppliers === 1 ? "نعم" : "لا"}.`,
    },
    {
      key: "supplier-descriptions",
      label: "اكتمال نبذات الموردين",
      status: incompleteDescriptions === 0 ? "pass" as const : "warning" as const,
      detail: `${incompleteDescriptions} من ${activeSuppliers} نبذة نشطة أقصر من 60 حرفاً.`,
    },
    {
      key: "product-images",
      label: "صور المنتجات",
      status: productsWithoutImages === 0 ? "pass" as const : "warning" as const,
      detail: `${productsWithoutImages} من ${activeProducts} منتج نشط بلا صورة.`,
    },
  ];
  const summary = {
    passed: checks.filter((check) => check.status === "pass").length,
    warnings: checks.filter((check) => check.status === "warning").length,
    failed: checks.filter((check) => check.status === "fail").length,
  };
  return { generatedAt: new Date().toISOString(), summary, checks };
}