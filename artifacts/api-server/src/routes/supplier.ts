import { Router, type IRouter, type Request, type Response } from "express";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { directoryDb } from "../lib/directory-db";
import { clearSupplierSession, getSupplierIdFromRequest, setSupplierSession } from "../lib/supplier-auth";
import { clearBuyerSession } from "../lib/buyer-auth";

const router: IRouter = Router();
const reportReasons = ["إساءة أو إزعاج", "بيانات غير صحيحة", "طلب مخالف", "احتيال أو انتحال", "أخرى"];

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

function publicSupplier(supplier: Record<string, unknown>) {
  return {
    id: supplier.id,
    name: supplier.name,
    city: supplier.city,
    phone: supplier.phone,
    whatsapp: supplier.whatsapp,
    isVerified: Boolean(supplier.isVerified),
  };
}

function getSupplier(supplierId: number) {
  return directoryDb.prepare(`
    SELECT s.id, s.name, s.city, s.phone, s.whatsapp, s.is_verified AS isVerified
    FROM suppliers s
    JOIN supplier_users su ON su.supplier_id = s.id
    WHERE s.id = ? AND s.is_active = 1 AND su.status = 'active'
  `).get(supplierId) as Record<string, unknown> | undefined;
}

function requireSupplier(req: Request, res: Response) {
  const supplierId = getSupplierIdFromRequest(req);
  if (!supplierId) {
    res.status(401).json({ error: "يجب تسجيل دخول المورد أولاً." });
    return null;
  }
  const supplier = getSupplier(supplierId);
  if (!supplier) {
    clearSupplierSession(res);
    res.status(401).json({ error: "صلاحية المورد غير متاحة حالياً." });
    return null;
  }
  return { supplierId, supplier };
}

router.post("/supplier/login", (req, res): void => {
  if (req.body?.rememberMe !== undefined && typeof req.body.rememberMe !== "boolean") {
    res.status(400).json({ error: "قيمة تذكرني غير صحيحة." });
    return;
  }
  const phone = normalizeSaudiPhone(text(req.body?.phone));
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const remember = req.body?.rememberMe === true;
  if (!isSaudiPhone(phone) || password.length < 6) {
    res.status(400).json({ error: "أدخل رقم جوال المورد وكلمة المرور الصحيحة." });
    return;
  }
  const account = directoryDb.prepare(`
    SELECT su.supplier_id AS supplierId, su.password_hash AS passwordHash
    FROM supplier_users su
    JOIN suppliers s ON s.id = su.supplier_id
    WHERE su.phone = ? AND su.status = 'active' AND s.is_active = 1
  `).get(phone) as { supplierId: number; passwordHash: string } | undefined;
  if (!account || !verifyPassword(password, account.passwordHash)) {
    res.status(401).json({ error: "بيانات دخول المورد غير صحيحة." });
    return;
  }
  const now = new Date().toISOString();
  directoryDb.prepare("UPDATE supplier_users SET last_login = ? WHERE supplier_id = ?").run(now, account.supplierId);
  const supplier = getSupplier(account.supplierId);
  if (!supplier) {
    res.status(401).json({ error: "حساب المورد غير متاح حالياً." });
    return;
  }
  clearBuyerSession(res);
  setSupplierSession(res, account.supplierId, remember);
  res.json({ success: true, supplier: publicSupplier(supplier) });
});

router.post("/supplier/logout", (_req, res): void => {
  clearSupplierSession(res);
  res.json({ success: true });
});

router.get("/supplier/me", (req, res): void => {
  const session = requireSupplier(req, res);
  if (!session) return;
  res.json({ supplier: publicSupplier(session.supplier) });
});

router.get("/supplier/analytics", (req, res): void => {
  const session = requireSupplier(req, res);
  if (!session) return;
  const supplierId = session.supplierId;
  const summary = directoryDb.prepare(`
    SELECT
      (SELECT COUNT(*) FROM contact_logs WHERE supplier_id = ?) AS totalContacts,
      (SELECT COUNT(DISTINCT buyer_id) FROM contact_logs WHERE supplier_id = ?) AS uniqueBuyers,
      (SELECT COUNT(*) FROM contact_logs
       WHERE supplier_id = ? AND julianday(sent_at) >= julianday('now', '-30 days')) AS contacts30d,
      (SELECT COUNT(DISTINCT buyer_id) FROM contact_logs
       WHERE supplier_id = ? AND julianday(sent_at) >= julianday('now', '-30 days')) AS qualifiedContacts30d,
      (SELECT COUNT(*) FROM supplier_page_views
       WHERE supplier_id = ? AND julianday(viewed_at) >= julianday('now', '-30 days')) AS pageViews30d,
      (SELECT COUNT(*) FROM supplier_page_views WHERE supplier_id = ?) AS totalPageViews
  `).get(supplierId, supplierId, supplierId, supplierId, supplierId, supplierId) as Record<string, number>;
  const monthly = directoryDb.prepare(`
    SELECT strftime('%Y-%m', sent_at) AS month,
      COUNT(*) AS contactRequests,
      COUNT(DISTINCT buyer_id) AS uniqueBuyers
    FROM contact_logs
    WHERE supplier_id = ? AND julianday(sent_at) >= julianday('now', '-180 days')
    GROUP BY strftime('%Y-%m', sent_at)
    ORDER BY month ASC
  `).all(supplierId);
  const pageViews30d = Number(summary.pageViews30d || 0);
  const qualifiedContacts30d = Number(summary.qualifiedContacts30d || 0);
  res.json({
    totalContacts: Number(summary.totalContacts || 0),
    uniqueBuyers: Number(summary.uniqueBuyers || 0),
    contacts30d: Number(summary.contacts30d || 0),
    qualifiedContacts30d,
    pageViews30d,
    totalPageViews: Number(summary.totalPageViews || 0),
    contactRate30d: pageViews30d > 0 ? Number(((qualifiedContacts30d / pageViews30d) * 100).toFixed(1)) : 0,
    monthly: monthly.map((row) => {
      const item = row as { month: string; contactRequests: number; uniqueBuyers: number };
      return { month: item.month, contactRequests: Number(item.contactRequests), uniqueBuyers: Number(item.uniqueBuyers) };
    }),
  });
});

router.get("/supplier/contacts", (req, res): void => {
  const session = requireSupplier(req, res);
  if (!session) return;
  const rows = directoryDb.prepare(`
    SELECT cl.id, cl.message, cl.message_id AS messageId, cl.sent_at AS sentAt,
      b.id AS buyerId, b.full_name AS buyerName, b.phone AS buyerPhone,
      b.business_name AS businessName, b.business_type AS businessType,
      b.moderation_status AS buyerStatus,
      br.id AS reportId, br.status AS reportStatus
    FROM contact_logs cl
    JOIN buyer_users b ON b.id = cl.buyer_id
    LEFT JOIN buyer_reports br ON br.contact_log_id = cl.id
    WHERE cl.supplier_id = ?
    ORDER BY cl.sent_at DESC, cl.id DESC
  `).all(session.supplierId);
  res.json(rows.map((row) => {
    const item = row as Record<string, unknown>;
    return { ...item, reportId: item.reportId ? Number(item.reportId) : null };
  }));
});

router.post("/supplier/reports", (req, res): void => {
  const session = requireSupplier(req, res);
  if (!session) return;
  const contactLogId = Number(req.body?.contactLogId);
  const reason = text(req.body?.reason);
  const note = text(req.body?.note);
  if (!Number.isInteger(contactLogId) || contactLogId <= 0 || !reportReasons.includes(reason) || note.length > 1000) {
    res.status(400).json({ error: "اختر سبب البلاغ واكتب ملاحظة صحيحة إن لزم." });
    return;
  }
  const contact = directoryDb.prepare(`
    SELECT id, buyer_id AS buyerId, supplier_id AS supplierId
    FROM contact_logs WHERE id = ? AND supplier_id = ?
  `).get(contactLogId, session.supplierId) as { id: number; buyerId: number; supplierId: number } | undefined;
  if (!contact) {
    res.status(404).json({ error: "لا يمكن الإبلاغ إلا عن تواصل مسجل مع هذا المورد." });
    return;
  }
  const existing = directoryDb.prepare("SELECT id FROM buyer_reports WHERE contact_log_id = ?").get(contactLogId);
  if (existing) {
    res.status(409).json({ error: "تم رفع بلاغ لهذا التواصل مسبقاً." });
    return;
  }
  const now = new Date().toISOString();
  directoryDb.prepare(`
    INSERT INTO buyer_reports (contact_log_id, buyer_id, supplier_id, reason, note, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'open', ?)
  `).run(contact.id, contact.buyerId, contact.supplierId, reason, note || null, now);
  res.status(201).json({ success: true, message: "تم رفع البلاغ وسيتم مراجعته من الإدارة." });
});

export { hashPassword };
export { reportReasons };
export default router;