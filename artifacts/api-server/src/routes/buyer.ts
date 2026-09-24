import { Router, type IRouter } from "express";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { directoryDb } from "../lib/directory-db";
import { clearBuyerSession, getBuyerIdFromRequest, setBuyerSession } from "../lib/buyer-auth";

const router: IRouter = Router();
const buyerBusinessTypes = ["مخبز", "محل حلويات", "مخبز وحلويات", "كافيه", "مطعم", "أسرة منتجة", "أسر منتجة", "فندق", "آخر"];

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSaudiPhone(value: string) {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const westernDigits = value.replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)));
  const digits = westernDigits.replace(/\D/g, "");
  if (digits.startsWith("00966")) return `0${digits.slice(5)}`;
  if (digits.startsWith("966")) return `0${digits.slice(3)}`;
  return digits;
}

function isSaudiPhone(value: string) {
  return /^05\d{8}$/.test(normalizeSaudiPhone(value));
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [algorithm, saltHex, hashHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

type BuyerRow = {
  id: number;
  fullName: string;
  phone: string;
  email: string | null;
  city: string;
  businessType: string;
  businessName: string | null;
  otherBusinessType: string | null;
  isOwner: number;
  jobTitle: string | null;
  passwordHash: string;
  createdAt: string;
  lastLogin: string | null;
  moderationStatus: "active" | "under_review" | "restricted" | "suspended" | "blocked";
  moderationReason: string | null;
  moderationUpdatedAt: string | null;
};

function getBuyer(buyerId: number) {
  return directoryDb.prepare(`
    SELECT id, full_name AS fullName, phone, email, city, business_type AS businessType,
      business_name AS businessName, other_business_type AS otherBusinessType,
      is_owner AS isOwner, job_title AS jobTitle,
      password_hash AS passwordHash,
      created_at AS createdAt, last_login AS lastLogin,
      moderation_status AS moderationStatus, moderation_reason AS moderationReason,
      moderation_updated_at AS moderationUpdatedAt
    FROM buyer_users WHERE id = ?
  `).get(buyerId) as BuyerRow | undefined;
}

function publicBuyer(buyer: BuyerRow) {
  return {
    id: buyer.id,
    fullName: buyer.fullName,
    phone: buyer.phone,
    email: buyer.email,
    city: buyer.city,
    businessType: buyer.businessType === "آخر" ? buyer.otherBusinessType || "آخر" : buyer.businessType,
    businessName: buyer.businessName,
    otherBusinessType: buyer.otherBusinessType,
    isOwner: buyer.isOwner === 1,
    jobTitle: buyer.jobTitle,
    createdAt: buyer.createdAt,
    lastLogin: buyer.lastLogin,
    moderationStatus: buyer.moderationStatus,
    moderationReason: buyer.moderationReason,
    moderationUpdatedAt: buyer.moderationUpdatedAt,
  };
}

function nextRequestCode(id: number) {
  return `REQ-${new Date().getFullYear()}-${String(id).padStart(3, "0")}`;
}

function normalizeWhatsAppNumber(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^9665\d{8}$/.test(digits)) return digits;
  if (/^05\d{8}$/.test(digits)) return `966${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) return `966${digits}`;
  return "";
}

function requireBuyer(req: Parameters<IRouter["get"]>[1] extends never ? never : any, res: any) {
  const buyerId = getBuyerIdFromRequest(req);
  if (!buyerId) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولاً." });
    return null;
  }
  const buyer = getBuyer(buyerId);
  if (!buyer) {
    clearBuyerSession(res);
    res.status(401).json({ error: "جلسة المستخدم غير صالحة." });
    return null;
  }
  return buyer;
}

function requireActiveBuyer(buyer: BuyerRow, res: any) {
  if (buyer.moderationStatus !== "active") {
    const messages = {
      under_review: "حسابك قيد المراجعة حالياً. لا يمكن بدء تواصل جديد حتى انتهاء المراجعة.",
      restricted: "حسابك مقيّد مؤقتاً. لا يمكن بدء تواصل جديد حالياً.",
      suspended: "حسابك موقوف مؤقتاً. تواصل مع الإدارة لمعرفة التفاصيل.",
      blocked: "تم حظر هذا الحساب من التواصل عبر الدليل.",
    } as const;
    res.status(403).json({ error: messages[buyer.moderationStatus] || "لا يسمح الحساب ببدء تواصل جديد." });
    return false;
  }
  return true;
}

router.post("/buyer/register", (req, res): void => {
  const body = req.body as Record<string, unknown>;
  const fullName = text(body.fullName);
  const phone = normalizeSaudiPhone(text(body.phone));
  const email = normalizeEmail(text(body.email));
  const city = text(body.city);
  const businessType = text(body.businessType);
  const businessName = text(body.businessName);
  const otherBusinessType = text(body.otherBusinessType);
  const isOwner = typeof body.isOwner === "boolean" ? body.isOwner : null;
  const jobTitle = text(body.jobTitle);
  const password = typeof body.password === "string" ? body.password : "";

  const hasInvalidEmail = Boolean(email && (email.length > 160 || !email.includes("@")));
  const wantsNewsletter = body.newsletterWeekly === true;
  if (fullName.length < 2 || fullName.length > 80 || !isSaudiPhone(phone) || hasInvalidEmail ||
      (wantsNewsletter && !email) ||
      !city || !buyerBusinessTypes.includes(businessType) || isOwner === null ||
      (businessType === "آخر" && (otherBusinessType.length < 2 || otherBusinessType.length > 80)) ||
      (!isOwner && (jobTitle.length < 2 || jobTitle.length > 80)) ||
      password.length < 6 || password.length > 128 || !/^[A-Za-z0-9]+$/.test(password)) {
    res.status(400).json({ error: "أكمل بيانات التسجيل. كلمة المرور يجب أن تكون 6 خانات على الأقل، أرقام أو أحرف إنجليزية فقط." });
    return;
  }

  try {
    const now = new Date().toISOString();
    const result = directoryDb.prepare(`
      INSERT INTO buyer_users
        (full_name, phone, email, city, business_type, business_name, other_business_type, is_owner, job_title, password_hash, created_at, last_login)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(fullName, phone, email || null, city, businessType, businessName || null, businessType === "آخر" ? otherBusinessType : null, isOwner ? 1 : 0, isOwner ? null : jobTitle, hashPassword(password), now, now);
    const buyerId = Number(result.lastInsertRowid);
    const requestResult = directoryDb.prepare(`
      INSERT INTO buyer_requests
        (request_code, full_name, phone, email, city, business_type, business_name, other_business_type,
         is_owner, job_title, referral_source, newsletter_weekly, buyers_group, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`TEMP-${randomUUID()}`, fullName, phone, email || null, city, businessType, businessName || null, businessType === "آخر" ? otherBusinessType : null, isOwner ? 1 : 0, isOwner ? null : jobTitle, null, wantsNewsletter ? 1 : 0, body.buyersGroup === true ? 1 : 0, now);
    const requestId = Number(requestResult.lastInsertRowid);
    const requestCode = nextRequestCode(requestId);
    directoryDb.prepare("UPDATE buyer_requests SET request_code = ? WHERE id = ?").run(requestCode, requestId);
    const buyer = getBuyer(buyerId);
    if (!buyer) throw new Error("تعذر إنشاء حساب صاحب العمل.");
    setBuyerSession(res, buyerId);
    res.status(201).json({ success: true, requestCode, message: "تم إنشاء حسابك وتسجيل دخولك بنجاح.", user: publicBuyer(buyer) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed: buyer_users.phone")) {
      res.status(409).json({ error: "رقم الجوال مستخدم مسبقاً. جرّب تسجيل الدخول." });
      return;
    }
    if (message.includes("UNIQUE constraint failed: buyer_users.email")) {
      res.status(409).json({ error: "البريد الإلكتروني مستخدم مسبقاً. جرّب تسجيل الدخول." });
      return;
    }
    res.status(400).json({ error: "تعذر إنشاء الحساب حالياً." });
  }
});

router.post("/buyer/login", (req, res): void => {
  const identifier = text(req.body?.identifier);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!identifier || !password) {
    res.status(400).json({ error: "أدخل رقم الجوال أو البريد الإلكتروني وكلمة المرور." });
    return;
  }
  const normalizedPhone = normalizeSaudiPhone(identifier);
  const normalizedEmail = normalizeEmail(identifier);
  const buyer = directoryDb.prepare(`
    SELECT id, full_name AS fullName, phone, email, city, business_type AS businessType,
      business_name AS businessName, other_business_type AS otherBusinessType,
      is_owner AS isOwner, job_title AS jobTitle,
      password_hash AS passwordHash,
      created_at AS createdAt, last_login AS lastLogin,
      moderation_status AS moderationStatus, moderation_reason AS moderationReason,
      moderation_updated_at AS moderationUpdatedAt
    FROM buyer_users WHERE phone = ? OR (email IS NOT NULL AND email = ?) LIMIT 1
  `).get(normalizedPhone, normalizedEmail) as BuyerRow | undefined;
  if (!buyer || !verifyPassword(password, buyer.passwordHash)) {
    res.status(401).json({ error: "بيانات الدخول غير صحيحة." });
    return;
  }
  if (buyer.moderationStatus === "blocked") {
    res.status(403).json({ error: "تم حظر هذا الحساب من استخدام الدليل." });
    return;
  }
  const now = new Date().toISOString();
  directoryDb.prepare("UPDATE buyer_users SET last_login = ? WHERE id = ?").run(now, buyer.id);
  setBuyerSession(res, buyer.id);
  res.json({ success: true, message: "تم تسجيل الدخول بنجاح.", user: publicBuyer({ ...buyer, lastLogin: now }) });
});

router.post("/buyer/logout", (_req, res): void => {
  clearBuyerSession(res);
  res.json({ success: true, message: "تم تسجيل الخروج." });
});

router.get("/buyer/me", (req, res): void => {
  const buyer = requireBuyer(req, res);
  if (!buyer) return;
  res.json({ user: publicBuyer(buyer) });
});

router.post("/buyer/contact", (req, res): void => {
  const buyer = requireBuyer(req, res);
  if (!buyer) return;
  if (!requireActiveBuyer(buyer, res)) return;
  const supplierId = Number(req.body?.supplierId);
  const customMessage = text(req.body?.message);
  if (!Number.isInteger(supplierId) || supplierId <= 0 || customMessage.length > 1000) {
    res.status(400).json({ error: "بيانات التواصل غير صحيحة." });
    return;
  }
  const supplier = directoryDb.prepare("SELECT id, name, whatsapp FROM suppliers WHERE id = ? AND is_active = 1").get(supplierId) as { id: number; name: string; whatsapp: string } | undefined;
  if (!supplier) {
    res.status(404).json({ error: "المورد غير موجود." });
    return;
  }
  const whatsappNumber = normalizeWhatsAppNumber(supplier.whatsapp);
  if (!whatsappNumber) {
    res.status(409).json({ error: "لا يتوفر رقم واتساب صالح لهذا المورد." });
    return;
  }

  const now = new Date().toISOString();
  const placeholderId = `TEMP-${randomUUID()}`;
  const result = directoryDb.prepare(`
    INSERT INTO contact_logs (buyer_id, supplier_id, message, message_id, sent_at, status)
    VALUES (?, ?, '', ?, ?, 'sent')
  `).run(buyer.id, supplier.id, placeholderId, now);
  const logId = Number(result.lastInsertRowid);
  const messageId = `MSG-${new Date().getFullYear()}-${String(logId).padStart(4, "0")}`;
  const activity = buyer.businessType === "آخر"
    ? buyer.otherBusinessType || "نشاط آخر"
    : buyer.businessType;
  const activityIcons: Record<string, string> = {
    "مخبز": "🥖",
    "محل حلويات": "🍰",
    "مخبز وحلويات": "🧁",
    "كافيه": "☕",
    "مطعم": "🍽️",
    "أسرة منتجة": "🏡",
    "أسر منتجة": "🏡",
    "فندق": "🏨",
    "آخر": "🏢",
  };
  const message = [
    "السلام عليكم ورحمة الله وبركاته",
    "",
    "📢 رسالة من دليل موردي المخابز والحلويات",
    "",
    `👤 الاسم: ${buyer.fullName}`,
    `🏢 النشاط: ${activityIcons[buyer.businessType] || "🏢"} ${activity}`,
    `📛 اسم النشاط: ${buyer.businessName || "غير محدد"}`,
    `📍 الموقع: ${buyer.city}`,
    `📞 الجوال: ${buyer.phone}`,
    `👔 الصفة: ${buyer.isOwner === 1 ? "صاحب العمل" : buyer.jobTitle || "ممثل المنشأة"}`,
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "💬 رسالة العميل:",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    customMessage || "استفسار عن المنتجات",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    `🔖 رقم المرجع: ${messageId}`,
    "",
    "نتشرف بتواصلكم 🌾",
  ].join("\n");
  directoryDb.prepare("UPDATE contact_logs SET message = ?, message_id = ? WHERE id = ?").run(message, messageId, logId);
  res.status(201).json({
    success: true,
    messageId,
    message,
    whatsappUrl: `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`,
  });
});

export default router;