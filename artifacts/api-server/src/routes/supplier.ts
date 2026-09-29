import { Router, type IRouter, type Request, type Response } from "express";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  CompleteSupplierActivationBody,
  CompleteSupplierActivationResponse,
  CreateSupplierRequestContactParams,
  CreateSupplierRequestContactResponse,
  CreateSupplierRequestOfferContactBody,
  CreateSupplierRequestOfferContactParams,
  GetSupplierActivationQueryParams,
  GetSupplierActivationResponse,
  GetSupplierAlmondVariantsResponse,
  UpdateSupplierAlmondVariantsBody,
  UpdateSupplierAlmondVariantsResponse,
} from "@workspace/api-zod";
import { directoryDb } from "../lib/directory-db";
import { getSupplierAlmondVariants, replaceSupplierAlmondVariants } from "../lib/almond-variants";
import { clearSupplierSession, getSupplierIdFromRequest, setSupplierSession } from "../lib/supplier-auth";
import { clearBuyerSession } from "../lib/buyer-auth";
import { getSupplierMarket } from "../lib/supplier-market";
import { isTestModeAccount, isTestModeRequest } from "../lib/test-mode";
import { publicCatalogVisibilitySql } from "../lib/catalog-visibility";

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

function toSaudiWhatsAppNumber(value: string) {
  const localNumber = normalizeSaudiPhone(value);
  return /^05\d{8}$/.test(localNumber) ? `966${localNumber.slice(1)}` : "";
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

function getSupplier(supplierId: number, allowTestMode = false) {
  return directoryDb.prepare(`
    SELECT s.id, s.name, s.city, s.phone, s.whatsapp, s.is_verified AS isVerified
    FROM suppliers s
    JOIN supplier_users su ON su.supplier_id = s.id
    WHERE s.id = ? AND (s.is_active = 1 OR (? = 1 AND EXISTS (
      SELECT 1 FROM test_mode_accounts t WHERE t.role = 'supplier' AND t.entity_id = s.id
    ))) AND su.status = 'active'
  `).get(supplierId, allowTestMode ? 1 : 0) as Record<string, unknown> | undefined;
}

function requireSupplier(req: Request, res: Response) {
  if (isTestModeRequest(req, "buyer")) {
    res.status(401).json({ error: "جلسة المورد غير متاحة أثناء معاينة صاحب العمل." });
    return null;
  }
  const supplierId = getSupplierIdFromRequest(req);
  if (!supplierId) {
    res.status(401).json({ error: "يجب تسجيل دخول المورد أولاً." });
    return null;
  }
  const supplier = getSupplier(supplierId, isTestModeRequest(req, "supplier", supplierId));
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

router.get("/supplier/almond-variants", (req, res): void => {
  const auth = requireSupplier(req, res);
  if (!auth) return;
  res.json(GetSupplierAlmondVariantsResponse.parse(getSupplierAlmondVariants(auth.supplierId, directoryDb)));
});

router.put("/supplier/almond-variants", (req, res): void => {
  const auth = requireSupplier(req, res);
  if (!auth) return;
  const parsed = UpdateSupplierAlmondVariantsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { mode } = parsed.data;
  if ((mode === "selected" && parsed.data.variants.length === 0)
    || (mode !== "selected" && parsed.data.variants.length > 0)) {
    res.status(400).json({ error: "حدد تركيبة واحدة على الأقل عند اختيار أصناف محددة، أو أرسل قائمة فارغة لبقية الخيارات." });
    return;
  }
  const uniqueVariants = new Map<string, (typeof parsed.data.variants)[number]>();
  for (const variant of parsed.data.variants) {
    const validSize = variant.form === "whole"
      ? variant.size === "32" || variant.size === "34" || variant.size === "36"
      : variant.size === null;
    if (!validSize) {
      res.status(400).json({ error: "اختر مقاس 32 أو 34 أو 36 للوز الحب، واترك المقاس فارغاً للشرائح والمطحون." });
      return;
    }
    uniqueVariants.set(`${variant.form}|${variant.preparation}|${variant.size ?? ""}`, variant);
  }
  const saved = replaceSupplierAlmondVariants(auth.supplierId, mode, [...uniqueVariants.values()], directoryDb);
  if (!saved) {
    res.status(409).json({ error: "لا يمكن تحديد تفضيلات اللوز قبل ربط حساب المورد بأحد أصناف اللوز المعتمدة." });
    return;
  }
  res.json(UpdateSupplierAlmondVariantsResponse.parse(getSupplierAlmondVariants(auth.supplierId, directoryDb)));
});

router.get("/supplier/activation", (req, res): void => {
  res.set("Cache-Control", "no-store");
  const parsed = GetSupplierActivationQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "رابط التفعيل غير صالح." });
    return;
  }
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const now = new Date().toISOString();
  const activation = directoryDb.prepare(`
    SELECT t.id, t.expires_at AS expiresAt, s.id AS supplierId, s.name AS supplierName, s.phone
    FROM supplier_activation_tokens t
    JOIN suppliers s ON s.id = t.supplier_id
    WHERE t.token_hash = ? AND t.used_at IS NULL AND t.revoked_at IS NULL
      AND t.expires_at > ? AND s.is_active = 1
  `).get(tokenHash, now) as {
    id: number;
    expiresAt: string;
    supplierId: number;
    supplierName: string;
    phone: string;
  } | undefined;
  if (!activation) {
    res.status(404).json({ error: "رابط التفعيل غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً من الإدارة." });
    return;
  }
  const access = directoryDb.prepare("SELECT status FROM supplier_users WHERE supplier_id = ?").get(activation.supplierId) as { status: string } | undefined;
  if (access?.status === "active") {
    res.status(409).json({ error: "تم تفعيل حساب هذا المورد مسبقاً." });
    return;
  }
  res.json(GetSupplierActivationResponse.parse({
    supplierName: activation.supplierName,
    phone: activation.phone,
    expiresAt: activation.expiresAt,
  }));
});

router.post("/supplier/activation/complete", (req, res): void => {
  res.set("Cache-Control", "no-store");
  const parsed = CompleteSupplierActivationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "أدخل كلمة مرور من 8 أحرف على الأقل وأعد كتابتها للتأكيد." });
    return;
  }
  const { token, password, confirmPassword } = parsed.data;
  if (password !== confirmPassword || Buffer.byteLength(password, "utf8") > 1024) {
    res.status(400).json({ error: "كلمتا المرور غير متطابقتين أو كلمة المرور طويلة جداً." });
    return;
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const passwordHash = hashPassword(password);
  const now = new Date().toISOString();
  let supplierId = 0;
  let failure: { status: number; message: string } | null = null;
  directoryDb.exec("BEGIN IMMEDIATE");
  try {
    const activation = directoryDb.prepare(`
      SELECT t.id, s.id AS supplierId, s.phone
      FROM supplier_activation_tokens t
      JOIN suppliers s ON s.id = t.supplier_id
      WHERE t.token_hash = ? AND t.used_at IS NULL AND t.revoked_at IS NULL
        AND t.expires_at > ? AND s.is_active = 1
    `).get(tokenHash, now) as { id: number; supplierId: number; phone: string } | undefined;
    if (!activation) {
      failure = { status: 404, message: "رابط التفعيل غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً من الإدارة." };
    } else {
      const access = directoryDb.prepare("SELECT status FROM supplier_users WHERE supplier_id = ?").get(activation.supplierId) as { status: string } | undefined;
      if (access?.status === "active") {
        failure = { status: 409, message: "تم تفعيل حساب هذا المورد مسبقاً." };
      } else {
        const consumed = directoryDb.prepare(`
          UPDATE supplier_activation_tokens SET used_at = ?
          WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?
        `).run(now, activation.id, now);
        if (consumed.changes !== 1) {
          failure = { status: 409, message: "تم استخدام رابط التفعيل أو إلغاؤه. اطلب رابطاً جديداً من الإدارة." };
        } else {
          const account = directoryDb.prepare(`
            INSERT INTO supplier_users (supplier_id, phone, password_hash, status, created_at, last_login)
            VALUES (?, ?, ?, 'active', ?, ?)
            ON CONFLICT(supplier_id) DO UPDATE SET
              phone = excluded.phone,
              password_hash = excluded.password_hash,
              status = 'active',
              last_login = excluded.last_login
            WHERE supplier_users.status = 'revoked'
          `).run(activation.supplierId, activation.phone, passwordHash, now, now);
          if (account.changes !== 1) {
            failure = { status: 409, message: "تعذر تفعيل الحساب. اطلب رابطاً جديداً من الإدارة." };
          } else {
            supplierId = activation.supplierId;
          }
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
  clearBuyerSession(res);
  setSupplierSession(res, supplierId);
  res.json(CompleteSupplierActivationResponse.parse({
    success: true,
    message: "تم إنشاء كلمة المرور وتفعيل حسابك. يمكنك الآن متابعة إدارة ملفك.",
  }));
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

router.get("/supplier/market", (req, res): void => {
  const session = requireSupplier(req, res);
  if (!session) return;
  const { topDemand, lowSupply, underservedCities, averageRating, supplierCount } = getSupplierMarket(session.supplierId);
  res.json({ topDemand, lowSupply, underservedCities, averageRating, supplierCount });
});

router.get("/supplier/dashboard", (req, res): void => {
  const session = requireSupplier(req, res);
  if (!session) return;
  const supplierId = session.supplierId;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();
  const previousWeekStart = new Date(now.getTime() - 14 * 86400000).toISOString();
  const count = (table: "supplier_page_views" | "contact_logs" | "reviews", dateColumn: string, since: string, until?: string) => {
    const query = `SELECT COUNT(*) AS total FROM ${table} WHERE supplier_id = ? AND ${dateColumn} >= ?${until ? ` AND ${dateColumn} < ?` : ""}`;
    const row = directoryDb.prepare(query).get(...(until ? [supplierId, since, until] : [supplierId, since])) as { total: number };
    return Number(row.total);
  };
  const views = count("supplier_page_views", "viewed_at", weekStart);
  const contacts = count("contact_logs", "sent_at", weekStart);
  const previousViews = count("supplier_page_views", "viewed_at", previousWeekStart, weekStart);
  const previousContacts = count("contact_logs", "sent_at", previousWeekStart, weekStart);
  const change = (current: number, previous: number) => previous > 0
    ? Math.round(((current - previous) / previous) * 100) : null;
  const market = getSupplierMarket(supplierId);
  const productSummary = directoryDb.prepare(`
    SELECT COUNT(*) AS total, SUM(CASE WHEN image_url IS NOT NULL AND image_url <> '' THEN 1 ELSE 0 END) AS withImages
    FROM products WHERE supplier_id = ?
  `).get(supplierId) as { total: number; withImages: number | null };
  const description = directoryDb.prepare("SELECT description FROM suppliers WHERE id = ?")
    .get(supplierId) as { description: string } | undefined;
  const fresh: Array<{ type: "opportunity" | "warning" | "tip"; title: string; description: string }> = [];
  if (market.ownDemand > 0) fresh.push({
    type: "opportunity", title: "بحث المشترين عن أصنافك",
    description: `${market.ownDemand} بحثاً من أصحاب أعمال مسجلين عن أصنافك خلال آخر 7 أيام (قد يبحث الشخص عن أكثر من صنف).`,
  });
  if (market.underservedCities.length) fresh.push({
    type: "opportunity", title: "مدن تحتاج موردي أصنافك",
    description: `${market.underservedCities.length} مدن متاحة لا تضم مورداً نشطاً لأصنافك: ${market.underservedCities.slice(0, 3).join("، ")}.`,
  });
  if (Number(productSummary.total) === 0 || Number(productSummary.withImages) < Number(productSummary.total)) fresh.push({
    type: "tip", title: "أضف صوراً لمنتجاتك",
    description: "تساعد الصور أصحاب الأعمال على فهم أصنافك. تواصل مع الإدارة لإضافة أو تحديث صور منتجاتك.",
  });
  if (!description?.description || description.description.trim().length < 60) fresh.push({
    type: "tip", title: "حدّث نبذة نشاطك",
    description: "أضف وصفاً يوضح منتجاتك ومناطق خدمتك. تواصل مع الإدارة لتحديث بيانات ملفك.",
  });
  const dynamicTitles = ["بحث المشترين عن أصنافك", "مدن تحتاج موردي أصنافك", "أضف صوراً لمنتجاتك", "حدّث نبذة نشاطك"];
  const testMode = isTestModeRequest(req, "supplier", supplierId);
  const upsert = directoryDb.prepare(`
    INSERT INTO supplier_opportunities (supplier_id, type, title, description, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(supplier_id, type, title) DO UPDATE SET description = excluded.description
  `);
  if (!testMode) for (const item of fresh) upsert.run(supplierId, item.type, item.title, item.description, now.toISOString());
  const remove = directoryDb.prepare("DELETE FROM supplier_opportunities WHERE supplier_id = ? AND title = ?");
  if (!testMode) for (const title of dynamicTitles) if (!fresh.some((item) => item.title === title)) remove.run(supplierId, title);
  const opportunities = testMode
    ? fresh.map((item, index) => ({ ...item, id: -(index + 1), isRead: false }))
    : directoryDb.prepare(`
    SELECT id, type, title, description, is_read AS isRead
    FROM supplier_opportunities WHERE supplier_id = ?
    ORDER BY is_read, created_at DESC LIMIT 20
  `).all(supplierId).map((row) => {
    const item = row as { id: number; type: string; title: string; description: string; isRead: number };
    return { ...item, isRead: Boolean(item.isRead) };
    });
  const rating = Number((directoryDb.prepare("SELECT average_rating AS rating FROM suppliers WHERE id = ?")
    .get(supplierId) as { rating: number }).rating);
  const totalReviews = count("reviews", "created_at", "1970-01-01");
  res.json({
    supplier: publicSupplier(session.supplier),
    month: {
      views: count("supplier_page_views", "viewed_at", monthStart),
      contacts: count("contact_logs", "sent_at", monthStart),
      rating: totalReviews ? rating : null,
      reviewsCount: count("reviews", "created_at", monthStart),
      totalReviews,
    },
    position: market.position,
    marketAverageRating: market.averageRating,
    ratingPercentile: market.ratingPercentile,
    opportunities,
    weekly: {
      views, viewsChangePercent: change(views, previousViews),
      contacts, contactsChangePercent: change(contacts, previousContacts),
      newReviews: count("reviews", "created_at", weekStart),
    },
  });
});

router.post("/supplier/opportunities/:id/read", (req, res): void => {
  const session = requireSupplier(req, res);
  if (!session) return;
  if (isTestModeRequest(req, "supplier", session.supplierId)) {
    res.status(403).json({ error: "تعديل التنبيهات متوقف أثناء وضع الاختبار." });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "معرّف الفرصة غير صالح." });
    return;
  }
  const result = directoryDb.prepare("UPDATE supplier_opportunities SET is_read = 1 WHERE id = ? AND supplier_id = ?")
    .run(id, session.supplierId);
  if (!result.changes) {
    res.status(404).json({ error: "الفرصة غير موجودة." });
    return;
  }
  res.json({ success: true });
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

function handleSupplierRequestContact(req: Request, res: Response, mode: "contact" | "offer"): void {
  const session = requireSupplier(req, res);
  if (!session) return;
  const publiclyVisibleSupplier = directoryDb.prepare(`
    SELECT 1
    FROM suppliers s
    WHERE s.id = ? AND s.is_active = 1
      AND ${publicCatalogVisibilitySql("s")}
  `).get(session.supplierId);
  if (!publiclyVisibleSupplier) {
    res.status(403).json({ error: "يجب أن يكون للمورد عرض معتمد ونشط للتواصل مع أصحاب الأعمال." });
    return;
  }

  const parsedParams = mode === "offer"
    ? CreateSupplierRequestOfferContactParams.safeParse(req.params)
    : CreateSupplierRequestContactParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "معرّف الطلب غير صالح." });
    return;
  }

  let offerText = "";
  if (mode === "offer") {
    const parsedBody = CreateSupplierRequestOfferContactBody.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: "اكتب تفاصيل العرض قبل المتابعة." });
      return;
    }
    offerText = text(parsedBody.data.offer);
    if (!offerText) {
      res.status(400).json({ error: "اكتب تفاصيل العرض قبل المتابعة." });
      return;
    }
  }

  const now = new Date().toISOString();
  const request = directoryDb.prepare(`
    SELECT r.id, r.buyer_id AS buyerId, r.title, r.description, r.quantity, r.unit,
      r.frequency, r.city, b.business_name AS businessName, b.business_type AS businessType,
      COALESCE(
        taxonomy_item.name,
        CASE
          WHEN instr(r.title, ' — ') > 0
            THEN trim(substr(r.title, 9, instr(r.title, ' — ') - 9))
          ELSE r.title
        END
      ) AS categoryName
    FROM requests r
    JOIN buyer_users b ON b.id = r.buyer_id
    LEFT JOIN supplier_taxonomy_legacy_imports legacy_mapping
      ON legacy_mapping.legacy_item_category_id = r.category_id
    LEFT JOIN supplier_taxonomy_items taxonomy_item
      ON taxonomy_item.id = legacy_mapping.taxonomy_item_id
    WHERE r.id = ? AND r.status = 'active'
      AND julianday(r.expires_at) > julianday(?)
      AND b.is_owner = 1 AND b.moderation_status = 'active'
  `).get(parsedParams.data.requestId, now) as {
    id: number;
    buyerId: number;
    title: string;
    description: string;
    quantity: number;
    unit: string;
    frequency: string;
    city: string;
    businessName: string | null;
    businessType: string;
    categoryName: string;
  } | undefined;

  if (!request) {
    res.status(404).json({ error: "الطلب غير متاح للتواصل." });
    return;
  }

  const supplierName = text(session.supplier.name);
  const supplierCity = text(session.supplier.city);
  const supplierContact = toSaudiWhatsAppNumber(text(session.supplier.whatsapp))
    || toSaudiWhatsAppNumber(text(session.supplier.phone));
  if (!supplierContact) {
    res.status(409).json({ error: "حدّث رقم التواصل في ملف المورد قبل إرسال الطلب." });
    return;
  }

  const formattedQuantity = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(request.quantity);
  const formattedSupplierContact = `\u2066+${supplierContact}\u2069`;
  let message: string;
  if (mode === "offer") {
    const supplierCategories = directoryDb.prepare(`
      SELECT name FROM (
        SELECT i.name
        FROM supplier_taxonomy_item_suppliers item_link
        JOIN supplier_taxonomy_items i ON i.id = item_link.item_id
        WHERE item_link.supplier_id = ?
        UNION
        SELECT n.name
        FROM supplier_taxonomy_supplier_links node_link
        JOIN supplier_taxonomy_nodes n ON n.id = node_link.node_id
        WHERE node_link.supplier_id = ?
      )
      ORDER BY name COLLATE NOCASE
    `).all(session.supplierId, session.supplierId) as Array<{ name: string }>;
    const supplierCategoryNames = supplierCategories.map((category) => text(category.name)).filter(Boolean);
    const supplierCategoryLabel = supplierCategoryNames.length
      ? `${supplierCategoryNames.slice(0, 4).join("، ")}${supplierCategoryNames.length > 4 ? "، وغيرها" : ""}`
      : "غير محددة";
    message = [
      "السلام عليكم ورحمة الله وبركاته",
      "",
      "📢 رد على احتياجك في دليل موردي المخابز والحلويات",
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "👤 معلومات المورد:",
      "━━━━━━━━━━━━━━━━━━━━",
      `• الاسم: ${supplierName || "مورد معتمد"}`,
      `• فئات الأصناف: ${supplierCategoryLabel}`,
      `• المدينة: ${supplierCity || "غير محددة"}`,
      `• الجوال: ${formattedSupplierContact}`,
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "📋 بخصوص طلبك:",
      "━━━━━━━━━━━━━━━━━━━━",
      `• المنشأة: ${request.businessName || request.businessType || "صاحب عمل"}`,
      `• الصنف: ${request.title}`,
      `• التصنيف: ${request.categoryName}`,
      `• الكمية: ${formattedQuantity} ${request.unit}`,
      `• التكرار: ${request.frequency}`,
      `• مدينتك: ${request.city}`,
      ...(request.description ? [`• التفاصيل: ${request.description}`] : []),
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "💬 العرض:",
      "━━━━━━━━━━━━━━━━━━━━",
      offerText,
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "",
      "🌾 دليل موردي المخابز والحلويات",
    ].join("\n");
  } else {
    message = [
      "السلام عليكم ورحمة الله وبركاته",
      "",
      "📢 طلب عرض سعر عبر دليل موردي المخابز والحلويات",
      "",
      `👤 المورد: ${supplierName || "مورد معتمد"}`,
      `📞 رقم التواصل: ${formattedSupplierContact}`,
      `📍 مدينة المورد: ${supplierCity || "غير محددة"}`,
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      `🏢 اسم النشاط: ${request.businessName || request.businessType || "صاحب عمل"}`,
      `📦 الاحتياج: ${request.title}`,
      `🗂️ التصنيف: ${request.categoryName}`,
      `⚖️ الكمية: ${formattedQuantity} ${request.unit}`,
      `🔁 التكرار: ${request.frequency}`,
      `📍 مدينة الطلب: ${request.city}`,
      ...(request.description ? [`📝 التفاصيل: ${request.description}`] : []),
      "━━━━━━━━━━━━━━━━━━━━",
      "",
      "نأمل تزويدنا بسعركم والتوفر المتوقع لهذا الاحتياج.",
    ].join("\n");
  }

  if (isTestModeRequest(req, "supplier", session.supplierId)) {
    res.json(CreateSupplierRequestContactResponse.parse({
      success: true,
      message,
      simulated: true,
      whatsappUrl: null,
    }));
    return;
  }

  const owner = directoryDb.prepare(`
    SELECT phone FROM buyer_users
    WHERE id = ? AND is_owner = 1 AND moderation_status = 'active'
  `).get(request.buyerId) as { phone: string } | undefined;
  const ownerNumber = owner ? toSaudiWhatsAppNumber(owner.phone) : "";
  if (!ownerNumber) {
    res.status(409).json({ error: "لا يتوفر رقم واتساب صالح لصاحب هذا الطلب." });
    return;
  }

  directoryDb.prepare(`
    INSERT INTO supplier_request_contact_logs (request_id, supplier_id, message, sent_at)
    VALUES (?, ?, ?, ?)
  `).run(request.id, session.supplierId, message, now);

  res.json(CreateSupplierRequestContactResponse.parse({
    success: true,
    message,
    simulated: false,
    whatsappUrl: `https://wa.me/${ownerNumber}?text=${encodeURIComponent(message)}`,
  }));
}

router.post("/supplier/requests/:requestId/contact", (req, res): void => {
  handleSupplierRequestContact(req, res, "contact");
});

router.post("/supplier/requests/:requestId/offer", (req, res): void => {
  handleSupplierRequestContact(req, res, "offer");
});

router.post("/supplier/reports", (req, res): void => {
  const session = requireSupplier(req, res);
  if (!session) return;
  if (isTestModeRequest(req, "supplier", session.supplierId)) {
    res.status(403).json({ error: "رفع البلاغات متوقف أثناء وضع الاختبار." });
    return;
  }
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