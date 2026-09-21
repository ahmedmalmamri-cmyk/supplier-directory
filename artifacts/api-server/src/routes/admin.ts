import { Router, type IRouter, type Request, type Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  AdminLoginBody,
  AdminLoginResponse,
  ListRegistrationInterestsResponse,
} from "@workspace/api-zod";
import { directoryDb } from "../lib/directory-db";

const router: IRouter = Router();
const adminCookieName = "bakery_admin_session";
const sessionDurationSeconds = 60 * 60 * 8;

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return secret;
}

function createSessionToken() {
  const expiresAt = Math.floor(Date.now() / 1000) + sessionDurationSeconds;
  const payload = `admin:${expiresAt}`;
  const signature = createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

function isAdminAuthenticated(req: Request) {
  const token = req.cookies?.[adminCookieName];
  if (!token) return false;
  const [role, expiresAtText, signature] = token.split(":").flatMap((part: string) => part.split("."));
  if (role !== "admin" || !expiresAtText || !signature) return false;
  const expiresAt = Number(expiresAtText);
  if (!Number.isInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
  const payload = `admin:${expiresAt}`;
  const expected = createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

function requireAdmin(req: Request, res: Response) {
  if (isAdminAuthenticated(req)) return true;
  res.status(401).json({ error: "تسجيل دخول المدير مطلوب" });
  return false;
}

router.post("/admin/login", (req, res): void => {
  const parsed = AdminLoginBody.safeParse(req.body);
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (!parsed.success || !configuredPassword || parsed.data.password !== configuredPassword) {
    res.status(401).json({ error: "كلمة مرور المدير غير صحيحة" });
    return;
  }
  res.cookie(adminCookieName, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: sessionDurationSeconds * 1000,
    path: "/",
  });
  res.json(AdminLoginResponse.parse({ success: true, message: "تم تسجيل الدخول إلى لوحة التحكم." }));
});

router.post("/admin/logout", (req, res): void => {
  res.clearCookie(adminCookieName, { httpOnly: true, sameSite: "lax", path: "/" });
  res.json(AdminLoginResponse.parse({ success: true, message: "تم تسجيل الخروج." }));
});

router.get("/admin/registrations", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const rows = directoryDb.prepare(`
    SELECT id, name, email, region, status,
      created_at AS createdAt, reviewed_at AS reviewedAt
    FROM registration_interests
    ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
      created_at DESC, id DESC
  `).all();
  res.json(ListRegistrationInterestsResponse.parse(rows));
});

function reviewRegistration(req: Request, res: Response, status: "approved" | "rejected") {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "معرف الطلب غير صحيح" });
    return;
  }
  const registration = directoryDb.prepare(`
    SELECT id, name, email, region, status
    FROM registration_interests WHERE id = ?
  `).get(id) as { id: number; name: string; email: string; region: string; status: string } | undefined;
  if (!registration) {
    res.status(404).json({ error: "طلب التسجيل غير موجود" });
    return;
  }
  if (registration.status !== "pending") {
    res.status(400).json({ error: "تمت مراجعة هذا الطلب مسبقاً" });
    return;
  }

  const reviewedAt = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    if (status === "approved") {
      const existingSupplier = directoryDb.prepare("SELECT id FROM suppliers WHERE name = ?").get(registration.name);
      if (!existingSupplier) {
        const nextId = (directoryDb.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS id FROM suppliers").get() as { id: number }).id;
        directoryDb.prepare(`
          INSERT INTO suppliers
            (id, name, city, region, description, phone, whatsapp, is_verified, created_at)
          VALUES (?, ?, ?, ?, ?, '', '', 0, ?)
        `).run(
          nextId,
          registration.name,
          "غير محدد",
          registration.region,
          "بيانات المورد قيد الإضافة والتحديث.",
          reviewedAt,
        );
      }
    }
    directoryDb.prepare(`
      UPDATE registration_interests SET status = ?, reviewed_at = ? WHERE id = ?
    `).run(status, reviewedAt, id);
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
  res.json(AdminLoginResponse.parse({
    success: true,
    message: status === "approved" ? "تمت الموافقة وإضافة المورد إلى الدليل." : "تم رفض طلب التسجيل.",
  }));
}

router.post("/admin/registrations/:id/approve", (req, res): void => {
  reviewRegistration(req, res, "approved");
});

router.post("/admin/registrations/:id/reject", (req, res): void => {
  reviewRegistration(req, res, "rejected");
});

export default router;