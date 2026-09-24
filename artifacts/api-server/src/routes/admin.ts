import { Router, type IRouter, type Request, type Response } from "express";
import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  AdminLoginBody,
  AdminLoginResponse,
  CreateSupplierInvitationDraftBody,
  GetSupplierInvitationOptionsResponse,
  GetSupplierSourceStatsResponse,
  ListRegistrationInterestsResponse,
} from "@workspace/api-zod";
import { directoryDb } from "../lib/directory-db";
import { hashPassword as hashSupplierPassword } from "./supplier";

const router: IRouter = Router();
const adminCookieName = "bakery_admin_session";
const sessionDurationSeconds = 60 * 60 * 8;
const uploadsDir = path.resolve(process.cwd(), "uploads");
mkdirSync(uploadsDir, { recursive: true });

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

function saveProductImage(dataUrl: unknown) {
  if (typeof dataUrl !== "string" || !dataUrl.trim()) throw new Error("اختر صورة المنتج أولاً.");
  const match = dataUrl.trim().match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw new Error("صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP.");
  const data = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (data.length > 5 * 1024 * 1024) throw new Error("حجم الصورة يتجاوز 5 ميجابايت.");
  const extension = match[1] === "image/jpeg" ? "jpg" : match[1].split("/")[1];
  const filename = `product-${randomUUID()}.${extension}`;
  writeFileSync(path.join(uploadsDir, filename), data);
  return `/api/uploads/${filename}`;
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = scryptSync(password, salt, 64).toString("hex");
  const providedBuffer = Buffer.from(hash, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

function createBasicSubscription(supplierId: number, startDate: string) {
  directoryDb.prepare(`
    INSERT INTO subscriptions
      (supplier_id, plan_id, start_date, end_date, status, amount_paid, payment_method, notes, created_at)
    VALUES (?, 1, ?, NULL, 'active', 0, 'free', ?, ?)
  `).run(supplierId, startDate, "الباقة الأساسية الافتراضية", startDate);
}

function normalizeSaudiPhone(value: string) {
  const westernDigits = value.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const digits = westernDigits.replace(/\D/g, "");
  if (digits.startsWith("00966")) return `0${digits.slice(5)}`;
  if (digits.startsWith("966")) return `0${digits.slice(3)}`;
  return digits;
}

function supplierInvitationQuery(status?: string) {
  const predicates = ["s.invite_token IS NOT NULL"];
  if (status === "unsent") predicates.push("s.invite_sent_at IS NULL");
  if (status === "sent") predicates.push("s.invite_sent_at IS NOT NULL", "s.invite_completed_at IS NULL");
  if (status === "completed") predicates.push("s.invite_completed_at IS NOT NULL");
  return directoryDb.prepare(`
    SELECT s.id AS supplierId, s.name, s.city, s.whatsapp,
      s.invite_sent_at AS inviteSentAt, s.invite_opened_at AS inviteOpenedAt,
      s.invite_completed_at AS inviteCompletedAt,
      (SELECT r.status FROM supplier_requests r WHERE r.invited_supplier_id = s.id
       ORDER BY r.id DESC LIMIT 1) AS requestStatus,
      s.is_active AS isActive, s.created_at AS createdAt
    FROM suppliers s
    WHERE ${predicates.join(" AND ")}
    ORDER BY CASE WHEN s.invite_completed_at IS NOT NULL THEN 2
      WHEN s.invite_sent_at IS NOT NULL THEN 1 ELSE 0 END, s.created_at DESC, s.id DESC
  `).all().map((row) => ({
    ...row as object,
    isActive: Boolean((row as { isActive: number }).isActive),
  }));
}

function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

router.post("/admin/login", (req, res): void => {
  const parsed = AdminLoginBody.safeParse(req.body);
  const configuredPassword = process.env.ADMIN_PASSWORD;
  const storedCredential = directoryDb.prepare("SELECT password_hash AS passwordHash FROM admin_credentials WHERE id = 1").get() as { passwordHash: string } | undefined;
  const validPassword = parsed.success && (
    (storedCredential ? verifyPassword(parsed.data.password, storedCredential.passwordHash) : Boolean(configuredPassword && parsed.data.password === configuredPassword))
  );
  if (!validPassword) {
    res.status(401).json({ error: "كلمة مرور المدير غير صحيحة" });
    return;
  }
  if (!storedCredential && parsed.success) {
    directoryDb.prepare(`
      INSERT INTO admin_credentials (id, password_hash, updated_at) VALUES (1, ?, ?)
    `).run(hashPassword(parsed.data.password), new Date().toISOString());
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
            (id, name, city, region, description, phone, whatsapp, is_verified,
             plan_id, max_products_allowed, is_featured, added_via, created_at)
          VALUES (?, ?, ?, ?, ?, '', '', 0, 1, 3, 0, 'self_registered', ?)
        `).run(
          nextId,
          registration.name,
          "غير محدد",
          registration.region,
          "بيانات المورد قيد الإضافة والتحديث.",
          reviewedAt,
        );
        createBasicSubscription(nextId, reviewedAt);
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

router.get("/admin/supplier-requests", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const rows = directoryDb.prepare(`
    SELECT id, request_code AS requestCode, business_name AS businessName,
      contact_person AS contactPerson, business_type AS businessType, phone, whatsapp, email,
      website, city, address, delivers_to_other_cities AS deliversToOtherCities,
      other_cities AS otherCities, categories, min_order AS minOrder, description,
      commercial_license_url AS commercialLicenseUrl, id_card_url AS idCardUrl,
      health_certificate_url AS healthCertificateUrl, accepted_terms AS acceptedTerms,
      accepted_business AS acceptedBusiness, accepted_publish AS acceptedPublish,
      status, rejection_reason AS rejectionReason, admin_note AS adminNote,
      created_at AS createdAt, reviewed_at AS reviewedAt,
      invited_supplier_id AS invitedSupplierId, product_images AS productImages
    FROM supplier_requests
    ORDER BY CASE WHEN status IN ('pending', 'pending_review') THEN 0
      WHEN status = 'approved' THEN 1 ELSE 2 END,
      created_at DESC, id DESC
  `).all().map((row) => {
    const item = row as Record<string, unknown>;
    return {
      ...item,
      categories: JSON.parse(String(item.categories || "[]")),
      deliversToOtherCities: Boolean(item.deliversToOtherCities),
      acceptedTerms: Boolean(item.acceptedTerms),
      acceptedBusiness: Boolean(item.acceptedBusiness),
      acceptedPublish: Boolean(item.acceptedPublish),
      invitedSupplierId: item.invitedSupplierId == null ? null : Number(item.invitedSupplierId),
      productImages: JSON.parse(String(item.productImages || "[]")),
    };
  });
  res.json(rows);
});

router.get("/admin/supplier-requests/:id", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.id);
  const row = directoryDb.prepare(`
    SELECT id, request_code AS requestCode, business_name AS businessName,
      contact_person AS contactPerson, business_type AS businessType, phone, whatsapp, email,
      website, city, address, delivers_to_other_cities AS deliversToOtherCities,
      other_cities AS otherCities, categories, min_order AS minOrder, description,
      commercial_license_url AS commercialLicenseUrl, id_card_url AS idCardUrl,
      health_certificate_url AS healthCertificateUrl, accepted_terms AS acceptedTerms,
      accepted_business AS acceptedBusiness, accepted_publish AS acceptedPublish,
      status, rejection_reason AS rejectionReason, admin_note AS adminNote,
      created_at AS createdAt, reviewed_at AS reviewedAt,
      invited_supplier_id AS invitedSupplierId, product_images AS productImages
    FROM supplier_requests WHERE id = ?
  `).get(id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: "طلب المورد غير موجود" });
    return;
  }
  res.json({
    ...row,
    categories: JSON.parse(String(row.categories || "[]")),
    deliversToOtherCities: Boolean(row.deliversToOtherCities),
    acceptedTerms: Boolean(row.acceptedTerms),
    acceptedBusiness: Boolean(row.acceptedBusiness),
    acceptedPublish: Boolean(row.acceptedPublish),
    invitedSupplierId: row.invitedSupplierId == null ? null : Number(row.invitedSupplierId),
    productImages: JSON.parse(String(row.productImages || "[]")),
  });
});

router.post("/admin/supplier-requests/:id/approve", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.id);
  const request = directoryDb.prepare("SELECT * FROM supplier_requests WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!request) {
    res.status(404).json({ error: "طلب المورد غير موجود" });
    return;
  }
  if (!["pending", "pending_review"].includes(String(request.status))) {
    res.status(409).json({ error: "تمت مراجعة هذا الطلب مسبقاً." });
    return;
  }
  const businessName = String(request.business_name);
  const city = String(request.city);
  const phone = String(request.phone);
  const whatsapp = String(request.whatsapp);
  const reviewedAt = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    const invitedSupplierId = Number(request.invited_supplier_id) || -1;
    const existing = directoryDb.prepare(`
      SELECT id FROM suppliers
      WHERE id = ? OR request_id = ? OR name = ?
      ORDER BY CASE WHEN id = ? THEN 0 WHEN request_id = ? THEN 1 ELSE 2 END
      LIMIT 1
    `).get(invitedSupplierId, id, businessName, invitedSupplierId, id) as { id: number } | undefined;
    const verified = request.commercial_license_url ? 1 : 0;
    if (existing) {
      directoryDb.prepare(`
        UPDATE suppliers SET name = ?, city = ?, region = 'المنطقة الشرقية', description = ?,
          phone = ?, whatsapp = ?, is_verified = ?, is_active = 1, request_id = ? WHERE id = ?
      `).run(businessName, city, String(request.description), phone, whatsapp, verified, id, existing.id);
      directoryDb.prepare("UPDATE supplier_users SET phone = ? WHERE supplier_id = ?").run(phone, existing.id);
      const subscription = directoryDb.prepare("SELECT id FROM subscriptions WHERE supplier_id = ? LIMIT 1").get(existing.id);
      if (!subscription) createBasicSubscription(existing.id, reviewedAt);
    } else {
      const nextId = (directoryDb.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS id FROM suppliers").get() as { id: number }).id;
      directoryDb.prepare(`
        INSERT INTO suppliers
          (id, name, city, region, description, phone, whatsapp, is_verified, request_id,
           is_active, plan_id, max_products_allowed, is_featured, added_via, created_at)
        VALUES (?, ?, ?, 'المنطقة الشرقية', ?, ?, ?, ?, ?, 1, 1, 3, 0, 'self_registered', ?)
      `).run(nextId, businessName, city, String(request.description), phone, whatsapp, verified, id, reviewedAt);
      createBasicSubscription(nextId, reviewedAt);
    }
    directoryDb.prepare("UPDATE supplier_requests SET status = 'approved', rejection_reason = NULL, reviewed_at = ? WHERE id = ?").run(reviewedAt, id);
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
  res.json({ success: true, message: "تمت الموافقة ونشر المورد في الدليل." });
});

router.post("/admin/supplier-requests/:id/reject", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.id);
  const request = directoryDb.prepare("SELECT id, status FROM supplier_requests WHERE id = ?").get(id) as { id: number; status: string } | undefined;
  if (!request) {
    res.status(404).json({ error: "طلب المورد غير موجود" });
    return;
  }
  if (!["pending", "pending_review"].includes(request.status)) {
    res.status(409).json({ error: "تمت مراجعة هذا الطلب مسبقاً." });
    return;
  }
  directoryDb.prepare(`
    UPDATE supplier_requests SET status = 'rejected', rejection_reason = ?, reviewed_at = ? WHERE id = ?
  `).run(typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 500) : null, new Date().toISOString(), id);
  res.json({ success: true, message: "تم رفض طلب المورد وحفظ السبب." });
});

router.post("/admin/supplier-requests/:id/request-info", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.id);
  const note = typeof req.body.note === "string" ? req.body.note.trim().slice(0, 500) : "";
  const result = directoryDb.prepare("UPDATE supplier_requests SET admin_note = ? WHERE id = ?").run(note, id);
  if (!result.changes) {
    res.status(404).json({ error: "طلب المورد غير موجود" });
    return;
  }
  res.json({ success: true, message: "تم حفظ طلب المعلومات." });
});

router.get("/admin/buyer-requests", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  res.json(directoryDb.prepare(`
    SELECT id, request_code AS requestCode, full_name AS fullName, phone, email, city,
      business_type AS businessType, other_business_type AS otherBusinessType,
      business_name AS businessName,
      referral_source AS referralSource, newsletter_weekly AS newsletterWeekly,
      buyers_group AS buyersGroup, created_at AS createdAt
    FROM buyer_requests ORDER BY created_at DESC, id DESC
  `).all().map((row) => ({
    ...row as object,
    newsletterWeekly: Boolean((row as { newsletterWeekly: number }).newsletterWeekly),
    buyersGroup: Boolean((row as { buyersGroup: number }).buyersGroup),
  })));
});

router.delete("/admin/buyer-requests/:id", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const result = directoryDb.prepare("DELETE FROM buyer_requests WHERE id = ?").run(Number(req.params.id));
  if (!result.changes) {
    res.status(404).json({ error: "طلب صاحب العمل غير موجود" });
    return;
  }
  res.json({ success: true, message: "تم حذف طلب صاحب العمل." });
});

router.get("/admin/invitations", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  if (status && !["unsent", "sent", "completed"].includes(status)) {
    res.status(400).json({ error: "حالة الدعوة غير صالحة." });
    return;
  }
  res.json(supplierInvitationQuery(status));
});

router.get("/admin/invitations/options", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const citiesRow = directoryDb.prepare(
    "SELECT value FROM directory_settings WHERE key = 'available_cities'",
  ).get() as { value: string } | undefined;
  try {
    res.json(GetSupplierInvitationOptionsResponse.parse({
      cities: JSON.parse(citiesRow?.value ?? "[]"),
    }));
  } catch {
    res.status(500).json({ error: "تعذر تحميل اقتراحات المدن." });
  }
});

router.post("/admin/invitations", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const parsed = CreateSupplierInvitationDraftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "أدخل اسم المورد ورقم واتساب والمدينة." });
    return;
  }
  const name = parsed.data.name.trim();
  const whatsapp = normalizeSaudiPhone(parsed.data.whatsapp);
  const city = parsed.data.city.trim();
  const source = parsed.data.source ?? "manual";
  const allowedCitiesRow = directoryDb.prepare(
    "SELECT value FROM directory_settings WHERE key = 'available_cities'",
  ).get() as { value: string } | undefined;
  let allowedCities: string[] = [];
  try {
    allowedCities = JSON.parse(allowedCitiesRow?.value ?? "[]") as string[];
  } catch {
    allowedCities = [];
  }
  if (name.length < 2 || !/^05\d{8}$/.test(whatsapp) || !allowedCities.includes(city)) {
    res.status(400).json({ error: "تحقق من اسم المورد ورقم واتساب والمدينة." });
    return;
  }
  const now = new Date().toISOString();
  const draftTokenHash = createHash("sha256").update(randomBytes(32)).digest("hex");
  const result = directoryDb.prepare(`
    INSERT INTO suppliers
      (name, city, region, description, phone, whatsapp, is_active, plan_id,
       max_products_allowed, is_featured, added_via, invite_token, created_at)
    VALUES (?, ?, 'المنطقة الشرقية', 'بانتظار استكمال بيانات المورد.', ?, ?, 0, 1, 3, 0, ?, ?, ?)
  `).run(name, city, whatsapp, whatsapp, source, draftTokenHash, now);
  res.status(201).json({
    supplierId: Number(result.lastInsertRowid),
    name,
    city,
    whatsapp,
    inviteSentAt: null,
    inviteOpenedAt: null,
    inviteCompletedAt: null,
    requestStatus: null,
    isActive: false,
    createdAt: now,
  });
});

router.get("/admin/invitations/stats", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const counts = directoryDb.prepare(`
    SELECT
      SUM(CASE WHEN invite_sent_at IS NOT NULL THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN invite_opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened,
      SUM(CASE WHEN invite_completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed
    FROM suppliers WHERE invite_token IS NOT NULL
  `).get() as { sent: number | null; opened: number | null; completed: number | null };
  const sent = Number(counts.sent || 0);
  const completed = Number(counts.completed || 0);
  res.json({
    sent,
    opened: Number(counts.opened || 0),
    completed,
    responseRate: sent > 0 ? Number(((completed / sent) * 100).toFixed(1)) : 0,
  });
});

router.get("/admin/suppliers/source-stats", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const counts = directoryDb.prepare(`
    SELECT
      SUM(CASE WHEN added_via = 'manual' THEN 1 ELSE 0 END) AS manual,
      SUM(CASE WHEN added_via = 'whatsapp' THEN 1 ELSE 0 END) AS whatsapp,
      SUM(CASE WHEN added_via = 'self_registered' THEN 1 ELSE 0 END) AS selfRegistered
    FROM suppliers
  `).get() as { manual: number | null; whatsapp: number | null; selfRegistered: number | null };
  res.json(GetSupplierSourceStatsResponse.parse({
    manual: Number(counts.manual ?? 0),
    whatsapp: Number(counts.whatsapp ?? 0),
    selfRegistered: Number(counts.selfRegistered ?? 0),
  }));
});

router.get("/admin/invitations/export", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const status = typeof req.query.status === "string" ? req.query.status : "";
  if (!["unsent", "sent", "completed"].includes(status)) {
    res.status(400).json({ error: "حدد قائمة دعوات صالحة للتصدير." });
    return;
  }
  const rows = supplierInvitationQuery(status) as Array<Record<string, unknown>>;
  const csv = [
    ["اسم المورد", "المدينة", "واتساب", "تاريخ الإرسال", "تاريخ الفتح", "تاريخ الإكمال", "حالة المراجعة"],
    ...rows.map((row) => [
      row.name, row.city, row.whatsapp, row.inviteSentAt, row.inviteOpenedAt,
      row.inviteCompletedAt, row.requestStatus,
    ]),
  ].map((row) => row.map(csvCell).join(",")).join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="supplier-invitations-${status}.csv"`);
  res.send(`\uFEFF${csv}`);
});

router.post("/admin/suppliers/:id/invite", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const supplierId = Number(req.params.id);
  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    res.status(400).json({ error: "معرّف المورد غير صالح." });
    return;
  }
  const supplier = directoryDb.prepare(`
    SELECT id, name, whatsapp, invite_completed_at AS inviteCompletedAt,
      (SELECT status FROM supplier_requests r WHERE r.invited_supplier_id = suppliers.id
       ORDER BY r.id DESC LIMIT 1) AS latestRequestStatus
    FROM suppliers WHERE id = ?
  `).get(supplierId) as { id: number; name: string; whatsapp: string; inviteCompletedAt: string | null; latestRequestStatus: string | null } | undefined;
  if (!supplier) {
    res.status(404).json({ error: "المورد غير موجود." });
    return;
  }
  if (supplier.inviteCompletedAt && supplier.latestRequestStatus !== "rejected") {
    res.status(409).json({ error: "أكمل المورد هذه الدعوة بالفعل." });
    return;
  }
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  directoryDb.prepare(`
    UPDATE suppliers SET invite_token = ?, invite_sent_at = NULL,
      invite_opened_at = NULL, invite_completed_at = NULL WHERE id = ?
  `).run(tokenHash, supplierId);
  res.json({ supplierId, token, supplierName: supplier.name, whatsapp: supplier.whatsapp });
});

router.post("/admin/suppliers/:id/invite-sent", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const supplierId = Number(req.params.id);
  const supplier = directoryDb.prepare(
    "SELECT id, invite_token AS inviteToken, invite_completed_at AS inviteCompletedAt FROM suppliers WHERE id = ?",
  ).get(supplierId) as { id: number; inviteToken: string | null; inviteCompletedAt: string | null } | undefined;
  if (!supplier) {
    res.status(404).json({ error: "المورد غير موجود." });
    return;
  }
  if (!supplier.inviteToken || supplier.inviteCompletedAt) {
    res.status(409).json({ error: "أنشئ رابط دعوة صالحاً قبل تسجيل الإرسال." });
    return;
  }
  directoryDb.prepare(
    "UPDATE suppliers SET invite_sent_at = COALESCE(invite_sent_at, ?) WHERE id = ?",
  ).run(new Date().toISOString(), supplierId);
  res.json({ success: true, message: "تم تسجيل فتح رابط الإرسال. لا يمكن للنظام التحقق من إرسال الرسالة فعلياً." });
});

router.get("/admin/suppliers", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  res.json(directoryDb.prepare(`
    SELECT id, name, city, region, description, phone, whatsapp,
      address, website, google_category AS googleCategory,
      google_rating AS googleRating, google_review_count AS googleReviewCount,
      hours_note AS hoursNote,
      is_verified AS isVerified, is_active AS isActive, request_id AS requestId,
      average_rating AS averageRating, created_at AS createdAt,
      plan_id AS planId, max_products_allowed AS maxProductsAllowed,
      is_featured AS isFeatured,
      (SELECT name FROM plans p WHERE p.id = s.plan_id) AS planName,
      (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id) AS productCount
     FROM suppliers s
     WHERE s.is_active = 1 OR s.request_id IS NOT NULL OR s.invite_token IS NULL
     ORDER BY is_active DESC, created_at DESC, id DESC
  `).all().map((row) => ({
    ...row as object,
    isVerified: Boolean((row as { isVerified: number }).isVerified),
    isActive: Boolean((row as { isActive: number }).isActive),
    isFeatured: Boolean((row as { isFeatured: number }).isFeatured),
  })));
});

router.post("/admin/suppliers/:id/access", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const supplierId = Number(req.params.id);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!Number.isInteger(supplierId) || supplierId <= 0 || password.length < 6 || password.length > 128 || !/^[A-Za-z0-9]+$/.test(password)) {
    res.status(400).json({ error: "كلمة مرور المورد يجب أن تكون 6 خانات على الأقل، أرقاماً أو أحرفاً إنجليزية فقط." });
    return;
  }
  const supplier = directoryDb.prepare("SELECT id, phone FROM suppliers WHERE id = ?").get(supplierId) as { id: number; phone: string } | undefined;
  if (!supplier) {
    res.status(404).json({ error: "المورد غير موجود." });
    return;
  }
  const now = new Date().toISOString();
  directoryDb.prepare(`
    INSERT INTO supplier_users (supplier_id, phone, password_hash, status, created_at, last_login)
    VALUES (?, ?, ?, 'active', ?, NULL)
    ON CONFLICT(supplier_id) DO UPDATE SET phone = excluded.phone, password_hash = excluded.password_hash, status = 'active'
  `).run(supplier.id, supplier.phone, hashSupplierPassword(password), now);
  res.json({ success: true, message: "تم تفعيل وصول المورد. سلّمه رقم الجوال وكلمة المرور بشكل آمن." });
});

router.get("/admin/buyer-users", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const rows = directoryDb.prepare(`
    SELECT b.id, b.full_name AS fullName, b.phone, b.email, b.city,
      b.business_type AS businessType, b.other_business_type AS otherBusinessType,
      b.business_name AS businessName, b.moderation_status AS moderationStatus,
      b.moderation_reason AS moderationReason, b.moderation_updated_at AS moderationUpdatedAt,
      b.created_at AS createdAt, COUNT(br.id) AS reportCount
    FROM buyer_users b
    LEFT JOIN buyer_reports br ON br.buyer_id = b.id
    GROUP BY b.id
    ORDER BY CASE b.moderation_status
      WHEN 'under_review' THEN 0 WHEN 'restricted' THEN 1 WHEN 'suspended' THEN 2
      WHEN 'blocked' THEN 3 ELSE 4 END, b.created_at DESC
  `).all();
  res.json(rows);
});

router.get("/admin/buyer-reports", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const rows = directoryDb.prepare(`
    SELECT br.id, br.contact_log_id AS contactLogId, br.buyer_id AS buyerId,
      br.supplier_id AS supplierId, br.reason, br.note, br.status,
      br.admin_note AS adminNote, br.created_at AS createdAt, br.reviewed_at AS reviewedAt,
      b.full_name AS buyerName, b.phone AS buyerPhone, b.business_name AS businessName,
      b.city AS buyerCity, b.moderation_status AS buyerStatus,
      s.name AS supplierName, cl.message_id AS messageId, cl.sent_at AS contactedAt
    FROM buyer_reports br
    JOIN buyer_users b ON b.id = br.buyer_id
    JOIN suppliers s ON s.id = br.supplier_id
    JOIN contact_logs cl ON cl.id = br.contact_log_id
    ORDER BY CASE br.status WHEN 'open' THEN 0 ELSE 1 END, br.created_at DESC, br.id DESC
  `).all();
  res.json(rows);
});

router.post("/admin/buyer-users/:id/status", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const buyerId = Number(req.params.id);
  const status = typeof req.body.status === "string" ? req.body.status : "";
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 1000) : "";
  const statuses = ["active", "under_review", "restricted", "suspended", "blocked"];
  if (!Number.isInteger(buyerId) || !statuses.includes(status)) {
    res.status(400).json({ error: "حالة صاحب العمل غير صحيحة." });
    return;
  }
  const buyer = directoryDb.prepare("SELECT id, moderation_status AS moderationStatus FROM buyer_users WHERE id = ?").get(buyerId) as { id: number; moderationStatus: string } | undefined;
  if (!buyer) {
    res.status(404).json({ error: "صاحب العمل غير موجود." });
    return;
  }
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    directoryDb.prepare(`
      UPDATE buyer_users SET moderation_status = ?, moderation_reason = ?, moderation_updated_at = ? WHERE id = ?
    `).run(status, reason || null, now, buyerId);
    directoryDb.prepare(`
      INSERT INTO buyer_moderation_decisions (buyer_id, report_id, previous_status, new_status, reason, created_at)
      VALUES (?, NULL, ?, ?, ?, ?)
    `).run(buyerId, buyer.moderationStatus, status, reason || null, now);
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
  res.json({ success: true, message: "تم تحديث حالة صاحب العمل وتسجيل القرار." });
});

router.post("/admin/buyer-reports/:id/review", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const reportId = Number(req.params.id);
  const reportStatus = typeof req.body.status === "string" ? req.body.status : "";
  const adminNote = typeof req.body.adminNote === "string" ? req.body.adminNote.trim().slice(0, 1000) : "";
  if (!Number.isInteger(reportId) || !["reviewed", "dismissed", "actioned"].includes(reportStatus)) {
    res.status(400).json({ error: "نتيجة مراجعة البلاغ غير صحيحة." });
    return;
  }
  const report = directoryDb.prepare("SELECT id FROM buyer_reports WHERE id = ?").get(reportId);
  if (!report) {
    res.status(404).json({ error: "البلاغ غير موجود." });
    return;
  }
  directoryDb.prepare(`
    UPDATE buyer_reports SET status = ?, admin_note = ?, reviewed_at = ? WHERE id = ?
  `).run(reportStatus, adminNote || null, new Date().toISOString(), reportId);
  res.json({ success: true, message: "تم حفظ نتيجة مراجعة البلاغ." });
});

router.post("/admin/product-images", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  try {
    const imageUrl = saveProductImage((req.body as Record<string, unknown>).dataUrl);
    res.status(201).json({ imageUrl });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "تعذر رفع الصورة." });
  }
});

router.patch("/admin/suppliers/:id", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const result = directoryDb.prepare(`
    UPDATE suppliers SET name = COALESCE(?, name), city = COALESCE(?, city),
      description = COALESCE(?, description), phone = COALESCE(?, phone), whatsapp = COALESCE(?, whatsapp)
    WHERE id = ?
  `).run(
    typeof body.name === "string" ? body.name.trim() : null,
    typeof body.city === "string" ? body.city.trim() : null,
    typeof body.description === "string" ? body.description.trim() : null,
    typeof body.phone === "string" ? body.phone.trim() : null,
    typeof body.whatsapp === "string" ? body.whatsapp.trim() : null,
    Number(req.params.id),
  );
  if (!result.changes) {
    res.status(404).json({ error: "المورد غير موجود" });
    return;
  }
  const updatedPhone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (updatedPhone) {
    directoryDb.prepare("UPDATE supplier_users SET phone = ? WHERE supplier_id = ?").run(updatedPhone, Number(req.params.id));
  }
  res.json({ success: true, message: "تم تحديث المورد." });
});

router.post("/admin/suppliers/:id/pause", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const result = directoryDb.prepare("UPDATE suppliers SET is_active = CASE is_active WHEN 1 THEN 0 ELSE 1 END WHERE id = ?").run(Number(req.params.id));
  if (!result.changes) {
    res.status(404).json({ error: "المورد غير موجود" });
    return;
  }
  res.json({ success: true, message: "تم تحديث حالة ظهور المورد." });
});

router.delete("/admin/suppliers/:id", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.id);
  directoryDb.exec("BEGIN");
  try {
    directoryDb.prepare("DELETE FROM subscriptions WHERE supplier_id = ?").run(id);
    directoryDb.prepare("DELETE FROM reviews WHERE supplier_id = ?").run(id);
    directoryDb.prepare("DELETE FROM products WHERE supplier_id = ?").run(id);
    const result = directoryDb.prepare("DELETE FROM suppliers WHERE id = ?").run(id);
    if (!result.changes) {
      directoryDb.exec("ROLLBACK");
      res.status(404).json({ error: "المورد غير موجود" });
      return;
    }
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
  res.json({ success: true, message: "تم حذف المورد ومنتجاته." });
});

router.post("/admin/suppliers/:id/products", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const categoryId = Number(body.categoryId);
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  if (!name || !Number.isInteger(categoryId) || !imageUrl) {
    res.status(400).json({ error: "اسم المنتج والتصنيف والصورة مطلوبة." });
    return;
  }
  if (!/^https?:\/\/|^\/(?:api\/)?uploads\//i.test(imageUrl)) {
    res.status(400).json({ error: "أدخل رابط صورة صالحاً يبدأ بـ https:// أو ارفع صورة من الجهاز." });
    return;
  }
  const supplier = directoryDb.prepare("SELECT id FROM suppliers WHERE id = ?").get(Number(req.params.id));
  if (!supplier) {
    res.status(404).json({ error: "المورد غير موجود" });
    return;
  }
  const supplierPlan = directoryDb.prepare(`
    SELECT s.max_products_allowed AS maxProductsAllowed, s.plan_id AS planId,
      p.name AS planName, p.max_products AS planMaxProducts
    FROM suppliers s LEFT JOIN plans p ON p.id = s.plan_id
    WHERE s.id = ?
  `).get(Number(req.params.id)) as {
    maxProductsAllowed: number;
    planId: number;
    planName: string | null;
    planMaxProducts: number | null;
  } | undefined;
  const currentProductCount = (directoryDb.prepare("SELECT COUNT(*) AS count FROM products WHERE supplier_id = ?").get(Number(req.params.id)) as { count: number }).count;
  const maxProducts = supplierPlan?.planMaxProducts ?? supplierPlan?.maxProductsAllowed ?? 3;
  if (currentProductCount >= maxProducts) {
    res.status(403).json({
      error: `وصل المورد إلى الحد الأقصى في ${supplierPlan?.planName || "الباقة الحالية"} (${maxProducts} منتجات). يرجى ترقية الباقة لإضافة منتجات أكثر.`,
      code: "PLAN_LIMIT_REACHED",
      planId: supplierPlan?.planId ?? 1,
      maxProducts,
      currentProductCount,
    });
    return;
  }
  const nextSortOrder = (directoryDb.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS sortOrder FROM products WHERE supplier_id = ?").get(Number(req.params.id)) as { sortOrder: number }).sortOrder;
  const result = directoryDb.prepare(`
    INSERT INTO products
      (supplier_id, category_id, name, weight, unit, country_of_origin, ingredients,
       technical_data, recommended_use, shelf_life, storage_conditions, min_order, price, image_url, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, '', '', '', '', '', ?, ?, ?, ?, ?)
  `).run(
    Number(req.params.id), categoryId, name, String(body.weight || ""), String(body.unit || "وحدة"),
    String(body.countryOfOrigin || "السعودية"), Number(body.minOrder) || 1, body.price == null ? null : Number(body.price), imageUrl, nextSortOrder, new Date().toISOString(),
  );
  res.status(201).json({ success: true, productId: Number(result.lastInsertRowid), message: "تمت إضافة المنتج." });
});

router.get("/admin/suppliers/:id/products", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const supplierId = Number(req.params.id);
  const supplier = directoryDb.prepare("SELECT id FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier) {
    res.status(404).json({ error: "المورد غير موجود" });
    return;
  }
  res.json(directoryDb.prepare(`
    SELECT id, name, image_url AS imageUrl, sort_order AS sortOrder
    FROM products WHERE supplier_id = ? ORDER BY sort_order, created_at, id
  `).all(supplierId));
});

router.patch("/admin/suppliers/:id/products/order", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const supplierId = Number(req.params.id);
  const productIds = Array.isArray(req.body.productIds)
    ? req.body.productIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id))
    : [];
  if (!productIds.length || new Set(productIds).size !== productIds.length) {
    res.status(400).json({ error: "قائمة ترتيب المنتجات غير صالحة." });
    return;
  }
  const existing = directoryDb.prepare("SELECT id FROM products WHERE supplier_id = ?").all(supplierId) as Array<{ id: number }>;
  const existingIds = new Set(existing.map((product) => product.id));
  if (productIds.length !== existingIds.size || productIds.some((id: number) => !existingIds.has(id))) {
    res.status(400).json({ error: "يجب إرسال جميع منتجات المورد بالترتيب الجديد." });
    return;
  }
  directoryDb.exec("BEGIN");
  try {
    const update = directoryDb.prepare("UPDATE products SET sort_order = ? WHERE id = ? AND supplier_id = ?");
    productIds.forEach((productId: number, index: number) => update.run(index, productId, supplierId));
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
  res.json({ success: true, message: "تم حفظ ترتيب المنتجات." });
});

router.post("/admin/suppliers/:id/subscription", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const supplierId = Number(req.params.id);
  const planId = Number(req.body.planId);
  const plan = directoryDb.prepare("SELECT * FROM plans WHERE id = ? AND is_active = 1").get(planId) as Record<string, unknown> | undefined;
  if (!plan) {
    res.status(400).json({ error: "الباقة غير موجودة أو غير مفعلة." });
    return;
  }
  const supplier = directoryDb.prepare("SELECT id FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier) {
    res.status(404).json({ error: "المورد غير موجود." });
    return;
  }
  const startDate = typeof req.body.startDate === "string" && req.body.startDate.trim()
    ? req.body.startDate.trim()
    : new Date().toISOString();
  const endDate = typeof req.body.endDate === "string" && req.body.endDate.trim() ? req.body.endDate.trim() : null;
  const paymentMethods = ["bank_transfer", "cash", "free"] as const;
  const paymentMethod = paymentMethods.includes(req.body.paymentMethod) ? req.body.paymentMethod : "free";
  const amountPaid = Number.isFinite(Number(req.body.amountPaid)) ? Number(req.body.amountPaid) : Number(plan.price_monthly);
  const notes = typeof req.body.notes === "string" ? req.body.notes.trim().slice(0, 500) : null;
  const reviewedAt = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    directoryDb.prepare(`
      UPDATE subscriptions SET status = 'cancelled'
      WHERE supplier_id = ? AND status = 'active'
    `).run(supplierId);
    directoryDb.prepare(`
      UPDATE suppliers SET plan_id = ?, subscription_start_date = ?, subscription_end_date = ?,
        max_products_allowed = ?, is_featured = ?
      WHERE id = ?
    `).run(planId, startDate, endDate, Number(plan.max_products), Number(plan.has_featured_listing) ? 1 : 0, supplierId);
    directoryDb.prepare(`
      INSERT INTO subscriptions
        (supplier_id, plan_id, start_date, end_date, status, amount_paid, payment_method, notes, created_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)
    `).run(supplierId, planId, startDate, endDate, amountPaid, paymentMethod, notes, reviewedAt);
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
  res.json({ success: true, message: `تم تفعيل ${String(plan.name)} للمورد.`, planId, maxProducts: Number(plan.max_products) });
});

router.get("/admin/stats", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const stats = directoryDb.prepare(`
    SELECT
      (SELECT COUNT(*) FROM supplier_requests WHERE status IN ('pending', 'pending_review')) AS pendingSupplierRequests,
      (SELECT COUNT(*) FROM suppliers WHERE is_active = 1) AS approvedSuppliers,
      (SELECT COUNT(*) FROM buyer_requests) AS buyers,
      (SELECT COUNT(*) FROM products) AS products,
      (SELECT COUNT(DISTINCT city) FROM suppliers WHERE is_active = 1 AND city != 'غير محدد') AS cities,
      (SELECT COUNT(*) FROM supplier_page_views) AS totalPageViews,
      (SELECT COUNT(*) FROM contact_logs) AS totalContacts,
      (SELECT COUNT(*) FROM supplier_page_views
       WHERE julianday(viewed_at) >= julianday('now', '-30 days')) AS pageViews30d,
      (SELECT COUNT(DISTINCT supplier_id || ':' || buyer_id) FROM contact_logs
       WHERE julianday(sent_at) >= julianday('now', '-30 days')) AS qualifiedContacts30d
  `).get() as Record<string, number>;
  const pageViews30d = Number(stats.pageViews30d || 0);
  const qualifiedContacts30d = Number(stats.qualifiedContacts30d || 0);
  res.json({
    ...stats,
    contactRate30d: pageViews30d > 0 ? Number(((qualifiedContacts30d / pageViews30d) * 100).toFixed(1)) : 0,
  });
});

router.get("/admin/contact-logs", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const rows = directoryDb.prepare(`
    SELECT cl.id, cl.message_id AS messageId, cl.sent_at AS sentAt,
      b.full_name AS buyerName,
      CASE
        WHEN b.business_type = 'آخر' THEN COALESCE(NULLIF(b.other_business_type, ''), 'آخر')
        ELSE b.business_type
      END AS businessType,
      s.name AS supplierName
    FROM contact_logs cl
    JOIN buyer_users b ON b.id = cl.buyer_id
    JOIN suppliers s ON s.id = cl.supplier_id
    ORDER BY cl.sent_at DESC, cl.id DESC
    LIMIT 500
  `).all();
  res.json(rows);
});

router.get("/admin/settings", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const citiesRow = directoryDb.prepare("SELECT value FROM directory_settings WHERE key = 'available_cities'").get() as { value: string } | undefined;
  const whatsappRow = directoryDb.prepare("SELECT value FROM directory_settings WHERE key = 'admin_whatsapp'").get() as { value: string } | undefined;
  const emailRow = directoryDb.prepare("SELECT value FROM directory_settings WHERE key = 'admin_email'").get() as { value: string } | undefined;
  const addressRow = directoryDb.prepare("SELECT value FROM directory_settings WHERE key = 'admin_address'").get() as { value: string } | undefined;
  res.json({
    cities: JSON.parse(citiesRow?.value || "[]"),
    whatsapp: whatsappRow?.value || "0566866805",
    email: emailRow?.value || "ahmed.m.almamri@gmail.com",
    address: addressRow?.value || "الدمام، المنطقة الشرقية\nالمملكة العربية السعودية",
    plans: directoryDb.prepare(`
      SELECT id, name, slug, price_monthly AS priceMonthly, max_products AS maxProducts,
        max_images_per_product AS maxImagesPerProduct, has_verified_badge AS hasVerifiedBadge,
        has_featured_listing AS hasFeaturedListing, has_banner AS hasBanner,
        has_analytics AS hasAnalytics, has_priority_support AS hasPrioritySupport,
        description, is_active AS isActive, display_order AS displayOrder
      FROM plans ORDER BY display_order, id
    `).all().map((row) => ({
      ...row as object,
      hasVerifiedBadge: Boolean((row as { hasVerifiedBadge: number }).hasVerifiedBadge),
      hasFeaturedListing: Boolean((row as { hasFeaturedListing: number }).hasFeaturedListing),
      hasBanner: Boolean((row as { hasBanner: number }).hasBanner),
      hasAnalytics: Boolean((row as { hasAnalytics: number }).hasAnalytics),
      hasPrioritySupport: Boolean((row as { hasPrioritySupport: number }).hasPrioritySupport),
      isActive: Boolean((row as { isActive: number }).isActive),
    })),
    categories: directoryDb.prepare("SELECT id, name, icon, slug FROM categories ORDER BY id").all(),
  });
});

router.post("/admin/settings/password", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const currentPassword = typeof req.body.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body.newPassword === "string" ? req.body.newPassword : "";
  const stored = directoryDb.prepare("SELECT password_hash AS passwordHash FROM admin_credentials WHERE id = 1").get() as { passwordHash: string } | undefined;
  if (!stored || !verifyPassword(currentPassword, stored.passwordHash) || newPassword.length < 8) {
    res.status(400).json({ error: "تحقق من كلمة المرور الحالية وأن تكون الجديدة 8 أحرف على الأقل." });
    return;
  }
  directoryDb.prepare("UPDATE admin_credentials SET password_hash = ?, updated_at = ? WHERE id = 1").run(hashPassword(newPassword), new Date().toISOString());
  res.json({ success: true, message: "تم تغيير كلمة مرور اللوحة." });
});

router.post("/admin/settings/whatsapp", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const whatsapp = typeof req.body.whatsapp === "string" ? req.body.whatsapp.trim() : "";
  if (!/^05\d{8}$/.test(whatsapp)) {
    res.status(400).json({ error: "أدخل رقم واتساب سعودياً بصيغة 05XXXXXXXX." });
    return;
  }
  directoryDb.prepare("INSERT OR REPLACE INTO directory_settings (key, value) VALUES ('admin_whatsapp', ?)").run(whatsapp);
  res.json({ success: true, whatsapp, message: "تم تحديث رقم الواتساب." });
});

router.post("/admin/settings/contact", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
  const address = typeof req.body.address === "string" ? req.body.address.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !address) {
    res.status(400).json({ error: "أدخل بريداً إلكترونياً صحيحاً وعنواناً." });
    return;
  }
  directoryDb.prepare("INSERT OR REPLACE INTO directory_settings (key, value) VALUES ('admin_email', ?)").run(email);
  directoryDb.prepare("INSERT OR REPLACE INTO directory_settings (key, value) VALUES ('admin_address', ?)").run(address);
  res.json({ success: true, email, address, message: "تم تحديث بيانات التواصل." });
});

router.post("/admin/settings/cities", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const city = typeof req.body.city === "string" ? req.body.city.trim() : "";
  if (!city) {
    res.status(400).json({ error: "اسم المدينة مطلوب." });
    return;
  }
  const row = directoryDb.prepare("SELECT value FROM directory_settings WHERE key = 'available_cities'").get() as { value: string } | undefined;
  const cities = JSON.parse(row?.value || "[]") as string[];
  if (!cities.includes(city)) cities.push(city);
  directoryDb.prepare("INSERT OR REPLACE INTO directory_settings (key, value) VALUES ('available_cities', ?)").run(JSON.stringify(cities));
  res.json({ success: true, cities, message: "تم تحديث المدن." });
});

router.post("/admin/settings/categories", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "اسم التصنيف مطلوب." });
    return;
  }
  const nextId = (directoryDb.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS id FROM categories").get() as { id: number }).id;
  const slug = `category-${nextId}`;
  directoryDb.prepare("INSERT INTO categories (id, name, icon, slug) VALUES (?, ?, 'Package', ?)").run(nextId, name, slug);
  res.json({ success: true, message: "تمت إضافة التصنيف." });
});

export default router;