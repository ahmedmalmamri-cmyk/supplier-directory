import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { directoryDb } from "./directory-db";

export type TestModeRole = "supplier" | "buyer";

const testModeCookieName = "bakery_test_mode";
const testModeDurationSeconds = 60 * 60 * 12;
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
  // Supplier preview accounts have been retired; old preview cookies must not grant access.
  if (role === "supplier") return null;
  if (role === "buyer" && !directoryDb.prepare("SELECT 1 FROM buyer_users WHERE id = ? AND moderation_status != 'blocked'").get(id)) return null;
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
  const checks: Array<{ key: string; label: string; status: "pass" | "warning" | "fail"; detail: string }> = [
    {
      key: "database",
      label: "اتصال قاعدة البيانات",
      status: "pass" as const,
      detail: `قاعدة SQLite متاحة، الإصدار ${databaseVersion}.`,
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