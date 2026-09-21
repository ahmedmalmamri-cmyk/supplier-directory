import { Router, type IRouter, type Request, type Response } from "express";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
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
      created_at AS createdAt, reviewed_at AS reviewedAt
    FROM supplier_requests
    ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
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
      created_at AS createdAt, reviewed_at AS reviewedAt
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
  const businessName = String(request.business_name);
  const city = String(request.city);
  const phone = String(request.phone);
  const whatsapp = String(request.whatsapp);
  const reviewedAt = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    const existing = directoryDb.prepare("SELECT id FROM suppliers WHERE request_id = ? OR name = ?").get(id, businessName) as { id: number } | undefined;
    const verified = request.commercial_license_url ? 1 : 0;
    if (existing) {
      directoryDb.prepare(`
        UPDATE suppliers SET name = ?, city = ?, region = 'المنطقة الشرقية', description = ?,
          phone = ?, whatsapp = ?, is_verified = ?, is_active = 1 WHERE id = ?
      `).run(businessName, city, "بيانات المورد قيد الإضافة والتحديث.", phone, whatsapp, verified, existing.id);
    } else {
      const nextId = (directoryDb.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS id FROM suppliers").get() as { id: number }).id;
      directoryDb.prepare(`
        INSERT INTO suppliers
          (id, name, city, region, description, phone, whatsapp, is_verified, request_id, is_active, created_at)
        VALUES (?, ?, ?, 'المنطقة الشرقية', ?, ?, ?, ?, ?, 1, ?)
      `).run(nextId, businessName, city, "بيانات المورد قيد الإضافة والتحديث.", phone, whatsapp, verified, id, reviewedAt);
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
  const request = directoryDb.prepare("SELECT id FROM supplier_requests WHERE id = ?").get(id);
  if (!request) {
    res.status(404).json({ error: "طلب المورد غير موجود" });
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
      business_type AS businessType, business_name AS businessName,
      referral_source AS referralSource, created_at AS createdAt
    FROM buyer_requests ORDER BY created_at DESC, id DESC
  `).all());
});

router.delete("/admin/buyer-requests/:id", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const result = directoryDb.prepare("DELETE FROM buyer_requests WHERE id = ?").run(Number(req.params.id));
  if (!result.changes) {
    res.status(404).json({ error: "طلب المشتري غير موجود" });
    return;
  }
  res.json({ success: true, message: "تم حذف طلب المشتري." });
});

router.get("/admin/suppliers", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  res.json(directoryDb.prepare(`
    SELECT id, name, city, region, description, phone, whatsapp,
      is_verified AS isVerified, is_active AS isActive, request_id AS requestId,
      average_rating AS averageRating, created_at AS createdAt,
      (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id) AS productCount
    FROM suppliers s ORDER BY is_active DESC, created_at DESC, id DESC
  `).all().map((row) => ({ ...row as object, isVerified: Boolean((row as { isVerified: number }).isVerified), isActive: Boolean((row as { isActive: number }).isActive) })));
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
  if (!name || !Number.isInteger(categoryId)) {
    res.status(400).json({ error: "اسم المنتج والتصنيف مطلوبان." });
    return;
  }
  const supplier = directoryDb.prepare("SELECT id FROM suppliers WHERE id = ?").get(Number(req.params.id));
  if (!supplier) {
    res.status(404).json({ error: "المورد غير موجود" });
    return;
  }
  const result = directoryDb.prepare(`
    INSERT INTO products
      (supplier_id, category_id, name, weight, unit, country_of_origin, ingredients,
       technical_data, recommended_use, shelf_life, storage_conditions, min_order, price, image_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, '', '', '', '', '', ?, ?, NULL, ?)
  `).run(
    Number(req.params.id), categoryId, name, String(body.weight || ""), String(body.unit || "وحدة"),
    String(body.countryOfOrigin || "السعودية"), Number(body.minOrder) || 1, body.price == null ? null : Number(body.price), new Date().toISOString(),
  );
  res.status(201).json({ success: true, productId: Number(result.lastInsertRowid), message: "تمت إضافة المنتج." });
});

router.get("/admin/stats", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const stats = directoryDb.prepare(`
    SELECT
      (SELECT COUNT(*) FROM supplier_requests WHERE status = 'pending') AS pendingSupplierRequests,
      (SELECT COUNT(*) FROM suppliers WHERE is_active = 1) AS approvedSuppliers,
      (SELECT COUNT(*) FROM buyer_requests) AS buyers,
      (SELECT COUNT(*) FROM products) AS products,
      (SELECT COUNT(DISTINCT city) FROM suppliers WHERE is_active = 1 AND city != 'غير محدد') AS cities
  `).get();
  res.json(stats);
});

router.get("/admin/settings", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const citiesRow = directoryDb.prepare("SELECT value FROM directory_settings WHERE key = 'available_cities'").get() as { value: string } | undefined;
  const whatsappRow = directoryDb.prepare("SELECT value FROM directory_settings WHERE key = 'admin_whatsapp'").get() as { value: string } | undefined;
  res.json({
    cities: JSON.parse(citiesRow?.value || "[]"),
    whatsapp: whatsappRow?.value || "0566866805",
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