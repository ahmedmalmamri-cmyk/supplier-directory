import { Router, type IRouter, type Request, type Response } from "express";
import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  AdminLoginBody,
  AdminLoginResponse,
  CreateSupplierInvitationDraftBody,
  CreateSupplierActivationLinkParams,
  CreateSupplierActivationLinkResponse,
  GetSupplierInvitationOptionsResponse,
  GetSupplierSourceStatsResponse,
  GetAdminItemCategoryDeletionPreviewParams,
  GetAdminItemCategoryDeletionPreviewResponse,
  ListRegistrationInterestsResponse,
  MarkSupplierInvitationSentBody,
  PermanentlyDeleteAdminItemCategoryParams,
  PermanentlyDeleteAdminItemCategoryResponse,
} from "@workspace/api-zod";
import { directoryDb } from "../lib/directory-db";
import { isLegacyItemCategoriesRetired } from "../lib/retire-legacy-item-categories";
import { itemCategorySupplierCounts } from "../lib/item-category-supplier-counts";
import { categoryTagGroupIdsMap, getGroupRecord } from "../lib/item-category-groups";
import { legacyItemCategoryAliasesForNames } from "../lib/item-category-aliases";
import {
  syncSupplierCategoryAssignments,
} from "../lib/supplier-category-db";
import {
  canonicalItemCategoryRootSlugs,
  uniqueItemCategorySlug,
} from "../lib/item-category-slugs";
import { requireAdmin } from "../lib/admin-auth";
import { hashPassword as hashSupplierPassword } from "./supplier";

const router: IRouter = Router();
const adminCookieName = "bakery_admin_session";
const sessionDurationSeconds = 60 * 60 * 8;
const uploadsDir = path.resolve(process.cwd(), "uploads");
mkdirSync(uploadsDir, { recursive: true });

router.use("/admin/item-categories", (req, res, next): void => {
  if (req.method === "GET" || !isLegacyItemCategoriesRetired(directoryDb)) {
    next();
    return;
  }
  if (!requireAdmin(req, res)) return;
  res.status(410).json({ error: "تم إيقاف إدارة التصنيفات القديمة. استخدم شجرة تصنيفات الموردين الجديدة." });
});

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

type ItemCategoryRow = {
  id: number;
  name: string;
  icon: string;
  slug: string;
  groupName: string;
  parentId: number | null;
  primaryGroupId: number | null;
  subGroupId: number | null;
  tagGroupIds: number[];
  description: string | null;
  notes: string | null;
  displayOnHome: number;
  displayOrder: number;
  isActive: number;
  createdAt: string;
  updatedAt: string;
};

function getItemCategoryRows() {
  const rows = directoryDb.prepare(`
    SELECT id, name, icon, slug, group_name AS groupName, parent_id AS parentId,
      primary_group_id AS primaryGroupId, sub_group_id AS subGroupId,
      description, notes, display_on_home AS displayOnHome, display_order AS displayOrder,
      is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
    FROM item_categories
    ORDER BY COALESCE(parent_id, id),
      CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END, display_order, id
  `).all() as Omit<ItemCategoryRow, "tagGroupIds">[];
  const tagGroupIdsByCategory = categoryTagGroupIdsMap(false);
  return rows.map((row) => ({
    ...row,
    tagGroupIds: tagGroupIdsByCategory.get(row.id) ?? [],
  }));
}

function getItemCategory(id: number) {
  const row = directoryDb.prepare(`
    SELECT id, name, icon, slug, group_name AS groupName, parent_id AS parentId,
      primary_group_id AS primaryGroupId, sub_group_id AS subGroupId,
      description, notes, display_on_home AS displayOnHome, display_order AS displayOrder,
      is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
    FROM item_categories WHERE id = ?
  `).get(id) as Omit<ItemCategoryRow, "tagGroupIds"> | undefined;
  if (!row) return undefined;
  return {
    ...row,
    tagGroupIds: categoryTagGroupIdsMap(false).get(id) ?? [],
  } as ItemCategoryRow;
}

function isCanonicalItemCategoryRoot(category: ItemCategoryRow) {
  return category.parentId === null &&
    (Boolean(getGroupRecord(category.id)) ||
      (canonicalItemCategoryRootSlugs as readonly string[]).includes(category.slug));
}

function isActiveCanonicalItemCategoryRoot(category: ItemCategoryRow | undefined) {
  return Boolean(category && category.isActive && isCanonicalItemCategoryRoot(category));
}

function itemCategorySnapshot(row: ItemCategoryRow) {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    slug: row.slug,
    groupName: row.groupName,
    parentId: row.parentId,
    primaryGroupId: row.primaryGroupId,
    subGroupId: row.subGroupId,
    tagGroupIds: row.tagGroupIds,
    description: row.description,
    notes: row.notes,
    displayOnHome: Boolean(row.displayOnHome),
    displayOrder: row.displayOrder,
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function recordItemCategoryActivity(
  actionType: "add" | "edit" | "transfer" | "delete",
  entityId: number,
  oldValue: unknown,
  newValue: unknown,
) {
  directoryDb.prepare(`
    INSERT INTO activity_log
      (admin_id, action_type, entity_type, entity_id, old_value, new_value, created_at)
    VALUES (1, ?, 'category', ?, ?, ?, ?)
  `).run(
    actionType,
    entityId,
    oldValue == null ? null : JSON.stringify(oldValue),
    newValue == null ? null : JSON.stringify(newValue),
    new Date().toISOString(),
  );
}

function parseActivityValue(value: string | null) {
  if (value == null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function categoryDescendantIds(categories: ItemCategoryRow[], parentId: number) {
  const descendants: number[] = [];
  const pending = [parentId];
  while (pending.length) {
    const current = pending.pop()!;
    const children = categories.filter((category) => category.parentId === current);
    for (const child of children) {
      if (descendants.includes(child.id)) continue;
      descendants.push(child.id);
      pending.push(child.id);
    }
  }
  return descendants;
}

function primaryGroupMoveError(
  categories: ItemCategoryRow[],
  categoryId: number,
  destinationGroupId: number,
) {
  if (categories.some((category) => category.parentId === categoryId)) {
    return "لا يمكن نقل تصنيف يحتوي على فروع؛ انقل فروعه أولاً.";
  }
  const destination = getGroupRecord(destinationGroupId);
  if (!destination || !destination.isActive) {
    return "يجب اختيار مجموعة رئيسية نشطة كوجهة للنقل.";
  }
  return undefined;
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
      other_cities AS otherCities, categories, available_items AS availableItems, min_order AS minOrder, description,
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
      other_cities AS otherCities, categories, available_items AS availableItems, min_order AS minOrder, description,
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
  const availableItems = String(request.available_items || "").trim();
  const description = [String(request.description).trim(), availableItems ? `الأصناف المتوفرة: ${availableItems}` : ""]
    .filter(Boolean).join("\n\n");
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
    let approvedSupplierId: number;
    if (existing) {
      directoryDb.prepare(`
        UPDATE suppliers SET name = ?, city = ?, region = 'المنطقة الشرقية', description = ?,
          phone = ?, whatsapp = ?, is_verified = ?, is_active = 1, request_id = ? WHERE id = ?
      `).run(businessName, city, description, phone, whatsapp, verified, id, existing.id);
      directoryDb.prepare("UPDATE supplier_users SET phone = ? WHERE supplier_id = ?").run(phone, existing.id);
      const subscription = directoryDb.prepare("SELECT id FROM subscriptions WHERE supplier_id = ? LIMIT 1").get(existing.id);
      if (!subscription) createBasicSubscription(existing.id, reviewedAt);
      approvedSupplierId = existing.id;
    } else {
      const nextId = (directoryDb.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS id FROM suppliers").get() as { id: number }).id;
      directoryDb.prepare(`
        INSERT INTO suppliers
          (id, name, city, region, description, phone, whatsapp, is_verified, request_id,
           is_active, plan_id, max_products_allowed, is_featured, added_via, created_at)
        VALUES (?, ?, ?, 'المنطقة الشرقية', ?, ?, ?, ?, ?, 1, 1, 3, 0, 'self_registered', ?)
      `).run(nextId, businessName, city, description, phone, whatsapp, verified, id, reviewedAt);
      createBasicSubscription(nextId, reviewedAt);
      approvedSupplierId = nextId;
    }
    directoryDb.prepare(`
      UPDATE supplier_requests
      SET status = 'approved', supplier_id = ?, rejection_reason = NULL, reviewed_at = ?
      WHERE id = ?
    `).run(approvedSupplierId, reviewedAt, id);
    syncSupplierCategoryAssignments(approvedSupplierId);
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
  res.json({ success: true, message: "تمت الموافقة ونشر المورد في الدليل." });
});

router.post("/admin/supplier-requests/:id/activation-link", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  res.set("Cache-Control", "no-store");
  const parsed = CreateSupplierActivationLinkParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "رقم طلب المورد غير صالح." });
    return;
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  let failure: { status: number; message: string } | null = null;
  let activationPath = "";

  directoryDb.exec("BEGIN IMMEDIATE");
  try {
    const request = directoryDb.prepare(`
      SELECT id, status, invited_supplier_id AS invitedSupplierId
      FROM supplier_requests WHERE id = ?
    `).get(parsed.data.id) as { id: number; status: string; invitedSupplierId: number | null } | undefined;
    if (!request) {
      failure = { status: 404, message: "طلب المورد غير موجود." };
    } else if (request.status !== "approved") {
      failure = { status: 409, message: "يمكن إنشاء رابط التفعيل بعد الموافقة على ملف المورد فقط." };
    } else {
      const invitedSupplierId = Number(request.invitedSupplierId) || 0;
      const supplier = directoryDb.prepare(`
        SELECT id, is_active AS isActive
        FROM suppliers
        WHERE id = ? OR request_id = ?
        ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END
        LIMIT 1
      `).get(invitedSupplierId, request.id, invitedSupplierId) as { id: number; isActive: number } | undefined;
      if (!supplier) {
        failure = { status: 404, message: "لم يُعثر على ملف المورد المرتبط بهذا الطلب." };
      } else if (supplier.isActive !== 1) {
        failure = { status: 409, message: "ملف المورد غير نشط، ولا يمكن إنشاء رابط تفعيل له." };
      } else {
        const access = directoryDb.prepare("SELECT status FROM supplier_users WHERE supplier_id = ?").get(supplier.id) as { status: string } | undefined;
        if (access?.status === "active") {
          failure = { status: 409, message: "حساب المورد مفعّل بالفعل، ولن يتم استبدال كلمة مروره." };
        } else {
          directoryDb.prepare(`
            UPDATE supplier_activation_tokens
            SET revoked_at = ?
            WHERE supplier_id = ? AND used_at IS NULL AND revoked_at IS NULL
          `).run(now, supplier.id);
          directoryDb.prepare(`
            INSERT INTO supplier_activation_tokens (supplier_id, token_hash, expires_at, created_at)
            VALUES (?, ?, ?, ?)
          `).run(supplier.id, tokenHash, expiresAt, now);
          activationPath = `/supplier/activate#token=${token}`;
        }
      }
    }
    if (failure) {
      directoryDb.exec("ROLLBACK");
    } else {
      directoryDb.exec("COMMIT");
    }
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }

  if (failure) {
    res.status(failure.status).json({ error: failure.message });
    return;
  }
  res.set("Cache-Control", "no-store");
  res.json(CreateSupplierActivationLinkResponse.parse({ path: activationPath, expiresAt }));
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
  const result = directoryDb.prepare(`
    UPDATE supplier_requests SET admin_note = ?, admin_notes = ? WHERE id = ?
  `).run(note, note, id);
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
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  let failure: { status: number; message: string } | null = null;
  let supplier: {
    id: number;
    name: string;
    whatsapp: string;
    inviteCompletedAt: string | null;
    latestRequestStatus: string | null;
  } | undefined;
  directoryDb.exec("BEGIN IMMEDIATE");
  try {
    supplier = directoryDb.prepare(`
      SELECT id, name, whatsapp, invite_completed_at AS inviteCompletedAt,
        (SELECT status FROM supplier_requests r WHERE r.invited_supplier_id = suppliers.id
         ORDER BY r.id DESC LIMIT 1) AS latestRequestStatus
      FROM suppliers WHERE id = ?
    `).get(supplierId) as typeof supplier;
    if (!supplier) {
      failure = { status: 404, message: "المورد غير موجود." };
    } else if (supplier.inviteCompletedAt && supplier.latestRequestStatus !== "rejected") {
      failure = { status: 409, message: "أكمل المورد هذه الدعوة بالفعل." };
    } else {
      directoryDb.prepare(`
        UPDATE suppliers SET pending_invite_token_hash = ? WHERE id = ?
      `).run(tokenHash, supplierId);
    }
    if (failure) directoryDb.exec("ROLLBACK");
    else directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
  if (failure) {
    res.status(failure.status).json({ error: failure.message });
    return;
  }
  if (!supplier) return;
  res.set("Cache-Control", "no-store");
  res.json({ supplierId, token, supplierName: supplier.name, whatsapp: supplier.whatsapp });
});

router.post("/admin/suppliers/:id/invite-sent", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const supplierId = Number(req.params.id);
  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    res.status(400).json({ error: "معرّف المورد غير صالح." });
    return;
  }
  const parsedBody = MarkSupplierInvitationSentBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "أرسل رمز رابط الدعوة الجديد لتسجيل فتح رابط الإرسال." });
    return;
  }
  const token = parsedBody.data.token;
  const pendingTokenHash = createHash("sha256").update(token).digest("hex");
  const now = new Date().toISOString();
  let failure: { status: number; message: string } | null = null;
  directoryDb.exec("BEGIN IMMEDIATE");
  try {
    const supplier = directoryDb.prepare(`
      SELECT id, pending_invite_token_hash AS pendingInviteTokenHash,
        invite_completed_at AS inviteCompletedAt,
        (SELECT status FROM supplier_requests r WHERE r.invited_supplier_id = suppliers.id
         ORDER BY r.id DESC LIMIT 1) AS latestRequestStatus
      FROM suppliers WHERE id = ?
    `).get(supplierId) as {
      id: number;
      pendingInviteTokenHash: string | null;
      inviteCompletedAt: string | null;
      latestRequestStatus: string | null;
    } | undefined;
    if (!supplier) {
      failure = { status: 404, message: "المورد غير موجود." };
    } else if (supplier.pendingInviteTokenHash !== pendingTokenHash) {
      failure = { status: 409, message: "رابط الدعوة غير صالح أو لم يعد الرابط المعلّق الأحدث." };
    } else if (supplier.inviteCompletedAt && supplier.latestRequestStatus !== "rejected") {
      failure = { status: 409, message: "أكمل المورد هذه الدعوة بالفعل." };
    } else {
      const promoted = directoryDb.prepare(`
        UPDATE suppliers
        SET invite_token = pending_invite_token_hash,
          pending_invite_token_hash = NULL,
          invite_sent_at = ?,
          invite_opened_at = NULL,
          invite_completed_at = NULL
        WHERE id = ? AND pending_invite_token_hash = ?
      `).run(now, supplierId, pendingTokenHash);
      if (!promoted.changes) {
        failure = { status: 409, message: "رابط الدعوة غير صالح أو لم يعد الرابط المعلّق الأحدث." };
      }
    }
    if (failure) directoryDb.exec("ROLLBACK");
    else directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
  if (failure) {
    res.status(failure.status).json({ error: failure.message });
    return;
  }
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

router.get("/admin/item-categories", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const categories = getItemCategoryRows();
  const supplierCounts = itemCategorySupplierCounts(categories);
  res.json(categories.map((category) => ({
    ...itemCategorySnapshot(category),
    supplierCount: supplierCounts.get(category.id) ?? 0,
  })));
});

router.get("/admin/item-categories/import-report", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const report = directoryDb.prepare(`
    SELECT added, skipped, failed, applied_at AS appliedAt
    FROM item_category_import_reports WHERE name = ?
  `).get("supplied-unassigned-items-2026-09-27");
  res.json(report ?? { added: 0, skipped: 0, failed: 0, appliedAt: null });
});

router.post("/admin/item-categories", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const icon = (typeof body.icon === "string" ? body.icon.trim() : "") || "icon:package";
  const rawParentId = Object.hasOwn(body, "primaryGroupId") ? body.primaryGroupId : body.parentId ?? null;
  const parentId = rawParentId === null ? null : typeof rawParentId === "number" ? rawParentId : Number.NaN;
  const rawSubGroupId = body.subGroupId === undefined || body.subGroupId === null
    ? null
    : Number(body.subGroupId);
  const description = body.description === undefined || body.description === null
    ? null
    : typeof body.description === "string"
      ? body.description.trim() || null
      : undefined;
  const notes = body.notes === undefined || body.notes === null
    ? null : typeof body.notes === "string" ? body.notes.trim() || null : undefined;
  if (!name || name.length > 100 || (body.icon !== undefined && typeof body.icon !== "string") || icon.length > 24 || description === undefined ||
      description && description.length > 500 ||
      notes === undefined || (notes && notes.length > 500) ||
      (parentId !== null && !Number.isInteger(parentId)) ||
      (rawSubGroupId !== null && !Number.isInteger(rawSubGroupId)) ||
      (parentId === null && rawSubGroupId !== null) ||
      (body.displayOnHome !== undefined && typeof body.displayOnHome !== "boolean")) {
    res.status(400).json({ error: "تحقق من اسم التصنيف ووصفه." });
    return;
  }
  if (directoryDb.prepare("SELECT id FROM item_categories WHERE lower(trim(name)) = lower(?)").get(name)) {
    res.status(409).json({ error: "يوجد تصنيف بهذا الاسم بالفعل." });
    return;
  }
  const parent = parentId === null ? undefined : getItemCategory(parentId);
  const primaryGroup = parentId === null ? undefined : getGroupRecord(parentId);
  if (parentId !== null && (!isActiveCanonicalItemCategoryRoot(parent) || !primaryGroup?.isActive || primaryGroup.parentId !== null)) {
    res.status(400).json({ error: "يجب اختيار مجموعة رئيسية نشطة كأب للتصنيف." });
    return;
  }
  if (rawSubGroupId !== null) {
    const subgroup = getGroupRecord(rawSubGroupId);
    if (!subgroup?.isActive || subgroup.parentId !== parentId) {
      res.status(400).json({ error: "يجب اختيار قسم فرعي تابع للمجموعة الرئيسية المحددة." });
      return;
    }
  }
  const displayOnHome = false;
  const displayOrder = (
    directoryDb.prepare(`
      SELECT COALESCE(MAX(display_order), 0) + 1 AS nextOrder
      FROM item_categories WHERE parent_id IS ?
    `).get(parentId) as { nextOrder: number }
  ).nextOrder;
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    const id = (directoryDb.prepare(`
      SELECT MAX(id) + 1 AS id FROM (
        SELECT COALESCE(MAX(id), 0) AS id FROM groups
        UNION ALL
        SELECT COALESCE(MAX(id), 0) AS id FROM item_categories
        UNION ALL
        SELECT COALESCE(MAX(id), 0) AS id FROM permanently_deleted_item_categories
      )
    `).get() as { id: number }).id;
    const slug = uniqueItemCategorySlug(
      name,
      (candidate) => Boolean(directoryDb.prepare(`
        SELECT 1 FROM item_categories WHERE slug = ?
        UNION ALL
        SELECT 1 FROM groups WHERE slug = ?
        LIMIT 1
      `).get(candidate, candidate)),
    );
    const result = directoryDb.prepare(`
      INSERT INTO item_categories
        (id, name, icon, slug, group_name, parent_id, description, notes, display_on_home,
         display_order, is_active, created_at, updated_at, primary_group_id, sub_group_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(
      id,
      name,
      icon,
      slug,
      primaryGroup?.name ?? "",
      parentId as number | null,
      description,
      notes,
      displayOnHome ? 1 : 0,
      displayOrder,
      now,
      now,
      parentId,
      rawSubGroupId,
    );
    const created = getItemCategory(Number(result.lastInsertRowid))!;
    recordItemCategoryActivity("add", id, null, itemCategorySnapshot(created));
    directoryDb.exec("COMMIT");
    res.status(201).json({ ...itemCategorySnapshot(created), supplierCount: 0 });
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not create item category");
    res.status(500).json({ error: "تعذر حفظ التصنيف." });
  }
});

router.patch("/admin/item-categories/order", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const parentId = req.body?.parentId == null ? null : Number(req.body.parentId);
  const categoryIds = Array.isArray(req.body?.categoryIds)
    ? req.body.categoryIds.map(Number)
    : [];
  if ((parentId !== null && !Number.isInteger(parentId)) ||
      !categoryIds.length || categoryIds.some((id: number) => !Number.isInteger(id)) ||
      new Set(categoryIds).size !== categoryIds.length) {
    res.status(400).json({ error: "قائمة ترتيب التصنيفات غير صالحة." });
    return;
  }
  const siblings = directoryDb.prepare(`
    SELECT id, display_order AS displayOrder FROM item_categories
    WHERE parent_id IS ? ORDER BY display_order, id
  `).all(parentId) as Array<{ id: number; displayOrder: number }>;
  if (siblings.length !== categoryIds.length ||
      siblings.some((category) => !categoryIds.includes(category.id))) {
    res.status(400).json({ error: "يجب ترتيب جميع التصنيفات في المستوى نفسه." });
    return;
  }
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    categoryIds.forEach((id: number, index: number) => {
      const previous = siblings.find((category) => category.id === id)!;
      const displayOrder = index + 1;
      if (previous.displayOrder === displayOrder) return;
      directoryDb.prepare(`
        UPDATE item_categories SET display_order = ?, updated_at = ? WHERE id = ?
      `).run(displayOrder, now, id);
      if (parentId === null) {
        directoryDb.prepare(`
          UPDATE groups SET display_order = ? WHERE id = ?
        `).run(displayOrder, id);
      }
      recordItemCategoryActivity("edit", id, { displayOrder: previous.displayOrder }, { displayOrder });
    });
    directoryDb.exec("COMMIT");
    res.json({ success: true });
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not reorder item categories");
    res.status(500).json({ error: "تعذر حفظ ترتيب التصنيفات." });
  }
});

router.patch("/admin/item-categories/:id", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "معرف التصنيف غير صحيح." });
    return;
  }
  const existing = getItemCategory(id);
  if (!existing) {
    res.status(404).json({ error: "التصنيف غير موجود." });
    return;
  }
  if (isCanonicalItemCategoryRoot(existing)) {
    res.status(400).json({ error: "عدّل بيانات المجموعة من إدارة المجموعات." });
    return;
  }
  const body = req.body as Record<string, unknown>;
  if (Object.hasOwn(body, "parentId")) {
    res.status(400).json({ error: "لا يمكن تغيير الأب عبر التحديث؛ استخدم نقل التصنيف إلى مجموعة رئيسية." });
    return;
  }
  const name = body.name === undefined ? existing.name : typeof body.name === "string" ? body.name.trim() : "";
  const icon = body.icon === undefined ? existing.icon : (typeof body.icon === "string" ? body.icon.trim() : "") || "icon:package";
  const rawPrimaryGroupId = body.primaryGroupId === undefined
    ? existing.primaryGroupId
    : body.primaryGroupId === null ? null : Number(body.primaryGroupId);
  const primaryGroupId = rawPrimaryGroupId === null ? null : Number(rawPrimaryGroupId);
  const primaryGroup = primaryGroupId !== null && Number.isInteger(primaryGroupId) ? getGroupRecord(primaryGroupId) : undefined;
  const rawSubGroupId = body.subGroupId === undefined ? existing.subGroupId :
    body.subGroupId === null ? null : Number(body.subGroupId);
  const subGroup = rawSubGroupId === null ? undefined :
    Number.isInteger(rawSubGroupId) ? getGroupRecord(rawSubGroupId) : undefined;
  const displayOrder = body.displayOrder === undefined
    ? existing.displayOrder
    : Number(body.displayOrder);
  const description = body.description === undefined
    ? existing.description
    : body.description === null
      ? null
      : typeof body.description === "string"
        ? body.description.trim() || null
        : undefined;
  const notes = body.notes === undefined ? existing.notes :
    body.notes === null ? null :
    typeof body.notes === "string" ? body.notes.trim() || null : undefined;
  if (!name || name.length > 100 || (body.icon !== undefined && typeof body.icon !== "string") || icon.length > 24 ||
      description === undefined || description && description.length > 500 ||
      notes === undefined || (notes && notes.length > 500) ||
      (body.isActive !== undefined && typeof body.isActive !== "boolean") ||
      (body.displayOnHome !== undefined && typeof body.displayOnHome !== "boolean") ||
      !Number.isInteger(displayOrder) || displayOrder < 0 ||
      (primaryGroupId !== null && (!Number.isInteger(primaryGroupId) || !primaryGroup?.isActive ||
        primaryGroup.parentId !== null || !isActiveCanonicalItemCategoryRoot(getItemCategory(primaryGroupId))))) {
    res.status(400).json({ error: "تحقق من بيانات التصنيف." });
    return;
  }
  if (rawSubGroupId !== null && (primaryGroupId === null ||
      !Number.isInteger(rawSubGroupId) || !subGroup?.isActive || subGroup.parentId !== primaryGroupId)) {
    res.status(400).json({ error: "يجب اختيار قسم فرعي تابع للمجموعة الرئيسية المحددة." });
    return;
  }
  const duplicate = directoryDb.prepare(`
    SELECT id FROM item_categories WHERE lower(trim(name)) = lower(?) AND id != ?
  `).get(name, id);
  if (duplicate) {
    res.status(409).json({ error: "يوجد تصنيف بهذا الاسم بالفعل." });
    return;
  }
  if (primaryGroupId !== null && primaryGroupId !== existing.primaryGroupId) {
    const moveError = primaryGroupMoveError(getItemCategoryRows(), id, primaryGroupId);
    if (moveError) {
      res.status(400).json({ error: moveError });
      return;
    }
  }
  const isActive = body.isActive === undefined ? Boolean(existing.isActive) : body.isActive as boolean;
  const displayOnHome = false;
  const groupName = primaryGroup?.name ?? "";
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    directoryDb.prepare(`
      UPDATE item_categories
      SET name = ?, icon = ?, group_name = ?, parent_id = ?, primary_group_id = ?, sub_group_id = ?,
          description = ?, notes = ?, is_active = ?, display_order = ?, display_on_home = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name,
      icon,
      groupName,
      primaryGroupId,
      primaryGroupId,
      rawSubGroupId,
      description,
      notes,
      isActive ? 1 : 0,
      displayOrder,
      displayOnHome ? 1 : 0,
      now,
      id,
    );
    if (name !== existing.name) {
      directoryDb.prepare(`
        INSERT OR IGNORE INTO item_category_aliases (alias, item_category_id)
        VALUES (?, ?)
      `).run(existing.name, id);
    }
    if (primaryGroupId === null) {
      directoryDb.prepare("DELETE FROM category_tags WHERE category_id = ?").run(id);
    } else if (existing.primaryGroupId !== primaryGroupId) {
      directoryDb.prepare(`
        DELETE FROM category_tags WHERE category_id = ? AND group_id = ?
      `).run(id, primaryGroupId);
    }
    const updated = getItemCategory(id)!;
    recordItemCategoryActivity("edit", id, itemCategorySnapshot(existing), itemCategorySnapshot(updated));
    directoryDb.exec("COMMIT");
    res.json({
      ...itemCategorySnapshot(updated),
      supplierCount: itemCategorySupplierCounts(getItemCategoryRows()).get(id) ?? 0,
    });
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not update item category");
    res.status(500).json({ error: "تعذر تحديث التصنيف." });
  }
});

router.post("/admin/item-categories/:id/transfer", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.id);
  const rawDestinationId = req.body?.destinationId;
  const destinationId = rawDestinationId == null ? null : Number(rawDestinationId);
  const moveSubcategories = req.body?.moveSubcategories;
  const rawSubGroupId = req.body?.subGroupId;
  if (!Number.isInteger(id) ||
      (destinationId !== null && !Number.isInteger(destinationId)) ||
      typeof moveSubcategories !== "boolean") {
    res.status(400).json({ error: "بيانات نقل التصنيف غير صالحة." });
    return;
  }
  const existing = getItemCategory(id);
  if (!existing) {
    res.status(404).json({ error: "التصنيف غير موجود." });
    return;
  }
  if (isCanonicalItemCategoryRoot(existing)) {
    res.status(400).json({ error: "لا يمكن نقل مجموعة رئيسية ثابتة." });
    return;
  }
  const categories = getItemCategoryRows();
  if (destinationId === id) {
    res.status(400).json({ error: "لا يمكن نقل التصنيف إلى نفسه أو إلى أحد تصنيفاته الفرعية." });
    return;
  }
  const previousParent = existing.parentId === null ? undefined : getItemCategory(existing.parentId);
  const previousGroup = existing.primaryGroupId === null ? undefined : getGroupRecord(existing.primaryGroupId);
  if (existing.primaryGroupId !== null && (!isActiveCanonicalItemCategoryRoot(previousParent) || !previousGroup?.isActive)) {
    res.status(400).json({ error: "يمكن نقل التصنيف الفرعي الموجود تحت مجموعة رئيسية فقط." });
    return;
  }
  if (destinationId === null) {
    res.status(400).json({ error: "يجب اختيار مجموعة رئيسية كوجهة للنقل." });
    return;
  }
  const subGroupId = rawSubGroupId === undefined
    ? (destinationId === existing.primaryGroupId ? existing.subGroupId : null)
    : rawSubGroupId === null ? null : Number(rawSubGroupId);
  if (subGroupId !== null) {
    const subgroup = Number.isInteger(subGroupId) ? getGroupRecord(subGroupId) : undefined;
    if (!subgroup?.isActive || subgroup.parentId !== destinationId) {
      res.status(400).json({ error: "يجب اختيار قسم فرعي تابع للمجموعة المستهدفة." });
      return;
    }
  }
  const destination = getItemCategory(destinationId);
  const destinationGroup = getGroupRecord(destinationId);
  if (!destination || !isActiveCanonicalItemCategoryRoot(destination) || !destinationGroup?.isActive) {
    res.status(400).json({ error: "وجهة النقل يجب أن تكون مجموعة رئيسية نشطة." });
    return;
  }
  const moveError = primaryGroupMoveError(categories, id, destinationId);
  if (moveError) {
    res.status(400).json({ error: moveError });
    return;
  }
  const directChildren = categories.filter((category) => category.parentId === id);
  const nameConflict = directoryDb.prepare(`
    SELECT id FROM item_categories
    WHERE parent_id IS ? AND lower(trim(name)) = lower(?) AND id != ?
  `).get(destinationId, existing.name, id);
  if (nameConflict) {
    res.status(409).json({ error: "يوجد تصنيف بالاسم نفسه في الوجهة المحددة." });
    return;
  }
  const nextGroupName = destination.groupName;
  const nextOrder = (
    directoryDb.prepare(`
      SELECT COALESCE(MAX(display_order), 0) + 1 AS nextOrder
      FROM item_categories WHERE parent_id IS ?
    `).get(destinationId) as { nextOrder: number }
  ).nextOrder;
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    directoryDb.prepare(`
      UPDATE item_categories
      SET parent_id = ?, primary_group_id = ?, sub_group_id = ?, group_name = ?, display_on_home = ?,
          display_order = ?, updated_at = ?
      WHERE id = ?
    `).run(
      destinationId,
      destinationId,
      subGroupId,
      nextGroupName,
      0,
      nextOrder,
      now,
      id,
    );
    directoryDb.prepare(`
      DELETE FROM category_tags WHERE category_id = ? AND group_id = ?
    `).run(id, destinationId);
    const updated = getItemCategory(id)!;
    recordItemCategoryActivity(
      "transfer",
      id,
      {
        category: itemCategorySnapshot(existing),
        subcategories: directChildren.map(itemCategorySnapshot),
      },
      {
        category: itemCategorySnapshot(updated),
        moveSubcategories,
        detachedSubcategoryIds: moveSubcategories ? [] : directChildren.map((child) => child.id),
      },
    );
    directoryDb.exec("COMMIT");
    const currentCategories = getItemCategoryRows();
    res.json({
      ...itemCategorySnapshot(updated),
      supplierCount: itemCategorySupplierCounts(currentCategories).get(id) ?? 0,
    });
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not transfer item category");
    res.status(500).json({ error: "تعذر نقل التصنيف." });
  }
});

router.delete("/admin/item-categories/:id", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "معرف التصنيف غير صحيح." });
    return;
  }
  const categories = getItemCategoryRows();
  const existing = categories.find((category) => category.id === id);
  if (!existing) {
    res.status(404).json({ error: "التصنيف غير موجود." });
    return;
  }
  if (isCanonicalItemCategoryRoot(existing)) {
    res.status(400).json({ error: "لا يمكن حذف مجموعة رئيسية ثابتة من شجرة التصنيفات." });
    return;
  }
  const ids = [id, ...categoryDescendantIds(categories, id)];
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    for (const categoryId of ids) {
      const previous = getItemCategory(categoryId)!;
      directoryDb.prepare(`
        UPDATE item_categories SET is_active = 0, display_on_home = 0, updated_at = ?
        WHERE id = ?
      `).run(now, categoryId);
      directoryDb.prepare("DELETE FROM category_tags WHERE category_id = ?").run(categoryId);
      if (categoryId === id) {
        recordItemCategoryActivity("delete", categoryId, itemCategorySnapshot(previous), {
          ...itemCategorySnapshot(getItemCategory(categoryId)!),
          deactivatedSubcategoryIds: ids.slice(1),
        });
      }
    }
    directoryDb.exec("COMMIT");
    res.json({ success: true, deactivatedCount: ids.length });
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not delete item category");
    res.status(500).json({ error: "تعذر حذف التصنيف." });
  }
});

function buildItemCategoryDeletionPreview(existing: ItemCategoryRow) {
  const id = existing.id;
  const childCategoryCount = (directoryDb.prepare("SELECT COUNT(*) AS count FROM item_categories WHERE parent_id = ?").get(id) as { count: number }).count;
  const supplierLinkCount = (directoryDb.prepare("SELECT COUNT(*) AS count FROM supplier_categories WHERE item_category_id = ?").get(id) as { count: number }).count;
  const aliases = directoryDb.prepare("SELECT alias FROM item_category_aliases WHERE item_category_id = ?").all(id) as Array<{ alias: string }>;
  const aliasCount = aliases.length;
  const productCount = (directoryDb.prepare("SELECT COUNT(*) AS count FROM products WHERE category_id = ?").get(id) as { count: number }).count;
  const selectedNames = new Set([existing.name]);
  const alternativeForAlias = directoryDb.prepare(`
    SELECT 1 FROM item_category_aliases a
    JOIN item_categories c ON c.id = a.item_category_id
    WHERE a.alias = ? AND c.id != ? AND c.is_active = 1
    LIMIT 1
  `);
  // Shared aliases remain resolvable after this item is removed; unique ones
  // must not disappear, even when no currently linked supplier uses them.
  let blockingAliasCount = 0;
  for (const { alias } of aliases) {
    if (alternativeForAlias.get(alias, id)) continue;
    blockingAliasCount++;
    selectedNames.add(alias);
  }
  for (const alias of legacyItemCategoryAliasesForNames([existing.name])) {
    if (!alternativeForAlias.get(alias, id)) selectedNames.add(alias);
  }
  const requests = directoryDb.prepare(`
    SELECT categories FROM supplier_requests
    WHERE status IN ('pending', 'pending_review', 'approved')
  `).all() as Array<{ categories: string }>;
  let requestCount = 0;
  let invalidRequests = false;
  for (const request of requests) {
    let selected: unknown;
    try {
      selected = JSON.parse(request.categories);
    } catch {
      invalidRequests = true;
      break;
    }
    if (!Array.isArray(selected)) {
      invalidRequests = true;
      break;
    }
    if (selected.some((name) => typeof name === "string" && selectedNames.has(name))) requestCount++;
  }
  return {
    id, name: existing.name, isActive: Boolean(existing.isActive),
    childCategoryCount, supplierLinkCount, aliasCount, blockingAliasCount, requestCount, productCount,
    canDelete: !isCanonicalItemCategoryRoot(existing) && !existing.isActive &&
      !childCategoryCount && !supplierLinkCount && !blockingAliasCount && !requestCount && !productCount && !invalidRequests,
    invalidRequests,
  };
}

router.get("/admin/item-categories/:id/permanent", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const params = GetAdminItemCategoryDeletionPreviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "معرف التصنيف غير صحيح." });
    return;
  }
  const existing = getItemCategory(params.data.id);
  if (!existing) {
    res.status(404).json({ error: "التصنيف غير موجود." });
    return;
  }
  const preview = buildItemCategoryDeletionPreview(existing);
  if (preview.invalidRequests) {
    res.status(409).json({ error: "توجد اختيارات تصنيفات غير صالحة في طلبات الموردين. راجعها قبل الحذف النهائي." });
    return;
  }
  res.json(GetAdminItemCategoryDeletionPreviewResponse.parse(preview));
});

router.delete("/admin/item-categories/:id/permanent", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const params = PermanentlyDeleteAdminItemCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "معرف التصنيف غير صحيح." });
    return;
  }
  const id = params.data.id;
  directoryDb.exec("BEGIN");
  try {
    const existing = getItemCategory(id);
    if (!existing) {
      directoryDb.exec("ROLLBACK");
      res.status(404).json({ error: "التصنيف غير موجود." });
      return;
    }
    if (isCanonicalItemCategoryRoot(existing)) {
      directoryDb.exec("ROLLBACK");
      res.status(400).json({ error: "لا يمكن حذف مجموعة رئيسية نهائياً من هذا المسار." });
      return;
    }
    if (existing.isActive) {
      directoryDb.exec("ROLLBACK");
      res.status(409).json({ error: "عطّل التصنيف أولاً، ثم اختر الحذف النهائي بعد تأكيد مستقل." });
      return;
    }
    const preview = buildItemCategoryDeletionPreview(existing);
    if (preview.invalidRequests) {
      directoryDb.exec("ROLLBACK");
      res.status(409).json({ error: "توجد اختيارات تصنيفات غير صالحة في طلبات الموردين. راجعها قبل الحذف النهائي." });
      return;
    }
    if (!preview.canDelete) {
      directoryDb.exec("ROLLBACK");
      const linked = [
        preview.childCategoryCount && `${preview.childCategoryCount} تصنيف فرعي`,
        preview.supplierLinkCount && `${preview.supplierLinkCount} ارتباط مورد`,
        preview.blockingAliasCount && `${preview.blockingAliasCount} اسم بديل بلا تصنيف نشط آخر`,
        preview.requestCount && `${preview.requestCount} طلب مورد`,
        preview.productCount && `${preview.productCount} منتج`,
      ].filter(Boolean).join("، ");
      res.status(409).json({ error: `لا يمكن الحذف النهائي لوجود بيانات مرتبطة (${linked}). راجع طلبات الموردين وانقل التصنيفات الفرعية أو افصل الارتباطات أولاً.` });
      return;
    }
    directoryDb.prepare(`
      INSERT INTO permanently_deleted_item_categories (id, name, deleted_at)
      VALUES (?, ?, ?)
    `).run(id, existing.name, new Date().toISOString());
    recordItemCategoryActivity("delete", id, itemCategorySnapshot(existing), { permanentlyDeleted: true });
    directoryDb.prepare("DELETE FROM item_categories WHERE id = ?").run(id);
    directoryDb.exec("COMMIT");
    res.json(PermanentlyDeleteAdminItemCategoryResponse.parse({ success: true }));
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    req.log.error({ err: error }, "Could not permanently delete item category");
    res.status(500).json({ error: "تعذر حذف التصنيف نهائياً." });
  }
});

router.get("/admin/activity-log", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const rows = directoryDb.prepare(`
    SELECT id, admin_id AS adminId, action_type AS actionType,
      entity_type AS entityType, entity_id AS entityId,
      old_value AS oldValue, new_value AS newValue, created_at AS createdAt
    FROM activity_log
    ORDER BY created_at DESC, id DESC LIMIT 500
  `).all() as Array<{
    id: number;
    adminId: number;
    actionType: string;
    entityType: string;
    entityId: number;
    oldValue: string | null;
    newValue: string | null;
    createdAt: string;
  }>;
  res.json(rows.map((row) => ({
    ...row,
    oldValue: parseActivityValue(row.oldValue),
    newValue: parseActivityValue(row.newValue),
  })));
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