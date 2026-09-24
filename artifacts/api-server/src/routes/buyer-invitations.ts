import { Router, type IRouter, type Request } from "express";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
} from "node:crypto";
import {
  ActivateBuyerInvitationBody,
  ActivateBuyerInvitationParams,
  ActivateBuyerInvitationResponse,
  CreateBuyerInvitationBody,
  CreateBuyerInvitationResponse,
  DeleteBuyerInvitationParams,
  DeleteBuyerInvitationResponse,
  ExportBuyerInvitationsQueryParams,
  GetBuyerInvitationLinkParams,
  GetBuyerInvitationLinkResponse,
  GetBuyerInvitationParams,
  GetBuyerInvitationResponse,
  GetBuyerInvitationStatsResponse,
  ListBuyerInvitationsQueryParams,
  ListBuyerInvitationsResponse,
  MarkBuyerInvitationSentParams,
  MarkBuyerInvitationSentResponse,
  UpdateBuyerInvitationBody,
  UpdateBuyerInvitationParams,
  UpdateBuyerInvitationResponse,
  UpdateInvitedBuyerAccountStatusBody,
  UpdateInvitedBuyerAccountStatusParams,
  UpdateInvitedBuyerAccountStatusResponse,
} from "@workspace/api-zod";
import { directoryDb } from "../lib/directory-db";
import { requireAdmin } from "../lib/admin-auth";
import { restoreExpiredBuyerSuspensions } from "../lib/buyer-moderation";

const router: IRouter = Router();
const businessTypes = ["مخبز", "محل حلويات", "مخبز وحلويات", "كافيه", "مطعم", "أسرة منتجة", "أسر منتجة", "فندق", "آخر"];
const accountStatusSql = `CASE
  WHEN bi.buyer_id IS NULL THEN 'invited'
  WHEN bu.moderation_status <> 'active' THEN 'suspended'
  WHEN bu.last_login IS NULL THEN 'activated'
  ELSE 'active'
END`;

type BuyerInvitationRow = {
  id: number;
  fullName: string;
  phone: string;
  businessName: string;
  businessType: string;
  city: string;
  internalNotes: string;
  tokenNonce: string;
  tokenHash: string;
  invitedAt: string;
  createdBy: string;
  inviteSentAt: string | null;
  activatedAt: string | null;
  buyerId: number | null;
  createdAt: string;
  lastLogin: string | null;
  suspendedUntil: string | null;
  accountStatus: "invited" | "activated" | "active" | "suspended";
};

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return secret;
}

function normalizeSaudiPhone(value: string) {
  const westernDigits = value.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const digits = westernDigits.replace(/\D/g, "");
  if (digits.startsWith("00966")) return `0${digits.slice(5)}`;
  if (digits.startsWith("966")) return `0${digits.slice(3)}`;
  return digits;
}

function toInternationalPhone(value: string) {
  const normalized = normalizeSaudiPhone(value);
  return /^05\d{8}$/.test(normalized) ? `966${normalized.slice(1)}` : "";
}

function invitationToken(id: number, nonce: string) {
  return createHmac("sha256", getSessionSecret())
    .update(`buyer-invite:${id}:${nonce}`)
    .digest("base64url");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getInvitation(id: number) {
  return directoryDb.prepare(`
    SELECT bi.id, bi.full_name AS fullName, bi.phone, bi.business_name AS businessName,
      bi.business_type AS businessType, bi.city, bi.internal_notes AS internalNotes,
      bi.token_nonce AS tokenNonce, bi.token_hash AS tokenHash,
      bi.invited_at AS invitedAt, bi.created_by AS createdBy,
      bi.invite_sent_at AS inviteSentAt, bi.activated_at AS activatedAt,
      bi.buyer_id AS buyerId, bi.created_at AS createdAt,
      bu.last_login AS lastLogin, bu.suspended_until AS suspendedUntil,
      ${accountStatusSql} AS accountStatus
    FROM buyer_invitations bi
    LEFT JOIN buyer_users bu ON bu.id = bi.buyer_id
    WHERE bi.id = ?
  `).get(id) as BuyerInvitationRow | undefined;
}

function publicInvitation(invitation: BuyerInvitationRow) {
  const { tokenNonce: _tokenNonce, tokenHash: _tokenHash, ...result } = invitation;
  return result;
}

function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function getRequestOrigin(req: Request) {
  const originHeader = typeof req.get("origin") === "string" ? req.get("origin") : "";
  try {
    if (originHeader) return new URL(originHeader).origin;
  } catch {
    // Fall back to the current request host when no valid browser origin is present.
  }
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto)?.split(",")[0]?.trim()
    || req.protocol;
  const host = req.get("host");
  if (!host) throw new Error("Unable to determine the public application origin");
  return new URL(`${protocol}://${host}`).origin;
}

function getApplicationBasePath(req: Request) {
  const referer = req.get("referer");
  if (!referer) return "";
  try {
    const pathname = new URL(referer).pathname.replace(/\/+$/, "");
    const adminPathIndex = pathname.lastIndexOf("/admin");
    if (adminPathIndex >= 0) return pathname.slice(0, adminPathIndex);
  } catch {
    // The root path is the safe default for a missing or malformed referrer.
  }
  return "";
}

router.get("/admin/buyer-invitations", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const query = ListBuyerInvitationsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "حالة الدعوة غير صالحة." });
    return;
  }
  restoreExpiredBuyerSuspensions();
  const rows = directoryDb.prepare(`
    SELECT bi.id, bi.full_name AS fullName, bi.phone, bi.business_name AS businessName,
      bi.business_type AS businessType, bi.city, bi.internal_notes AS internalNotes,
      bi.invited_at AS invitedAt, bi.created_by AS createdBy,
      bi.invite_sent_at AS inviteSentAt, bi.activated_at AS activatedAt,
      bi.buyer_id AS buyerId, bu.last_login AS lastLogin,
      bu.suspended_until AS suspendedUntil, bi.created_at AS createdAt,
      ${accountStatusSql} AS accountStatus
    FROM buyer_invitations bi
    LEFT JOIN buyer_users bu ON bu.id = bi.buyer_id
    ${query.data.status ? `WHERE ${accountStatusSql} = ?` : ""}
    ORDER BY bi.created_at DESC, bi.id DESC
  `).all(...(query.data.status ? [query.data.status] : []));
  res.json(ListBuyerInvitationsResponse.parse(rows));
});

router.post("/admin/buyer-invitations", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const parsed = CreateBuyerInvitationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "تحقق من اسم صاحب العمل ورقم الجوال وبيانات المنشأة." });
    return;
  }
  const fullName = parsed.data.fullName.trim();
  const phone = normalizeSaudiPhone(parsed.data.phone);
  const businessName = parsed.data.businessName.trim();
  const city = parsed.data.city.trim();
  if (!/^05\d{8}$/.test(phone) || !businessTypes.includes(parsed.data.businessType)) {
    res.status(400).json({ error: "أدخل رقم جوال سعودي صالحاً ونوع نشاط صحيحاً." });
    return;
  }
  const existingBuyer = directoryDb.prepare("SELECT id FROM buyer_users WHERE phone = ?").get(phone);
  const existingInvitation = directoryDb.prepare("SELECT id FROM buyer_invitations WHERE phone = ?").get(phone);
  if (existingBuyer || existingInvitation) {
    res.status(409).json({ error: "يوجد حساب أو دعوة مسجلة بهذا الرقم." });
    return;
  }
  const now = new Date().toISOString();
  const nonce = randomBytes(32).toString("base64url");
  try {
    const result = directoryDb.prepare(`
      INSERT INTO buyer_invitations
        (full_name, phone, business_name, business_type, city, internal_notes,
         token_nonce, token_hash, invited_at, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'الإدارة', ?)
    `).run(
      fullName,
      phone,
      businessName,
      parsed.data.businessType,
      city,
      parsed.data.internalNotes?.trim() ?? "",
      nonce,
      randomBytes(32).toString("hex"),
      parsed.data.invitedAt?.toISOString() ?? now,
      now,
    );
    const id = Number(result.lastInsertRowid);
    const token = invitationToken(id, nonce);
    directoryDb.prepare("UPDATE buyer_invitations SET token_hash = ? WHERE id = ?")
      .run(hashToken(token), id);
    const invitation = getInvitation(id);
    if (!invitation) throw new Error("Created invitation could not be loaded");
    res.status(201).json(CreateBuyerInvitationResponse.parse(publicInvitation(invitation)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed: buyer_invitations.phone")) {
      res.status(409).json({ error: "يوجد حساب أو دعوة مسجلة بهذا الرقم." });
      return;
    }
    res.status(500).json({ error: "تعذر حفظ الدعوة حالياً." });
  }
});

router.patch("/admin/buyer-invitations/:id", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const params = UpdateBuyerInvitationParams.safeParse(req.params);
  const parsed = UpdateBuyerInvitationBody.safeParse(req.body);
  if (!params.success || !parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
    res.status(400).json({ error: "بيانات تعديل الدعوة غير صالحة." });
    return;
  }
  const current = getInvitation(params.data.id);
  if (!current) {
    res.status(404).json({ error: "الدعوة غير موجودة." });
    return;
  }
  if (current.buyerId != null) {
    res.status(409).json({ error: "لا يمكن تعديل دعوة بعد تفعيل الحساب." });
    return;
  }
  const fields = parsed.data;
  const phone = fields.phone === undefined ? String(current.phone) : normalizeSaudiPhone(fields.phone);
  if (!/^05\d{8}$/.test(phone) || (fields.businessType && !businessTypes.includes(fields.businessType))) {
    res.status(400).json({ error: "أدخل رقم جوال سعودي صالحاً ونوع نشاط صحيحاً." });
    return;
  }
  const duplicateBuyer = directoryDb.prepare("SELECT id FROM buyer_users WHERE phone = ?").get(phone);
  const duplicateInvite = directoryDb.prepare(
    "SELECT id FROM buyer_invitations WHERE phone = ? AND id <> ?",
  ).get(phone, params.data.id);
  if (duplicateBuyer || duplicateInvite) {
    res.status(409).json({ error: "يوجد حساب أو دعوة أخرى مسجلة بهذا الرقم." });
    return;
  }
  directoryDb.prepare(`
    UPDATE buyer_invitations SET
      full_name = ?, phone = ?, business_name = ?, business_type = ?, city = ?,
      internal_notes = ?, invited_at = ?
    WHERE id = ?
  `).run(
    fields.fullName?.trim() ?? current.fullName,
    phone,
    fields.businessName?.trim() ?? current.businessName,
    fields.businessType ?? current.businessType,
    fields.city?.trim() ?? current.city,
    fields.internalNotes?.trim() ?? current.internalNotes,
    fields.invitedAt?.toISOString() ?? current.invitedAt,
    params.data.id,
  );
  const updated = getInvitation(params.data.id);
  if (!updated) {
    res.status(404).json({ error: "الدعوة غير موجودة." });
    return;
  }
  res.json(UpdateBuyerInvitationResponse.parse(publicInvitation(updated)));
});

router.delete("/admin/buyer-invitations/:id", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const params = DeleteBuyerInvitationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "معرّف الدعوة غير صالح." });
    return;
  }
  const invitation = getInvitation(params.data.id);
  if (!invitation) {
    res.status(404).json({ error: "الدعوة غير موجودة." });
    return;
  }
  if (invitation.buyerId != null) {
    res.status(409).json({ error: "لا يمكن حذف دعوة تم تفعيل حسابها." });
    return;
  }
  directoryDb.prepare("DELETE FROM buyer_invitations WHERE id = ?").run(params.data.id);
  res.json(DeleteBuyerInvitationResponse.parse({ success: true, message: "تم حذف الدعوة." }));
});

router.post("/admin/buyer-invitations/:id/link", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const params = GetBuyerInvitationLinkParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "معرّف الدعوة غير صالح." });
    return;
  }
  const invitation = getInvitation(params.data.id);
  if (!invitation) {
    res.status(404).json({ error: "الدعوة غير موجودة." });
    return;
  }
  if (invitation.buyerId != null) {
    res.status(409).json({ error: "تم تفعيل هذه الدعوة بالفعل." });
    return;
  }
  const token = invitationToken(Number(invitation.id), String(invitation.tokenNonce));
  const tokenHash = hashToken(token);
  if (tokenHash !== invitation.tokenHash) {
    directoryDb.prepare("UPDATE buyer_invitations SET token_hash = ? WHERE id = ?")
      .run(tokenHash, params.data.id);
  }
  const baseUrl = getRequestOrigin(req);
  const basePath = getApplicationBasePath(req);
  const url = new URL(`${basePath}/invite/buyer/${token}`, `${baseUrl}/`).toString();
  const whatsappRow = directoryDb.prepare(
    "SELECT value FROM directory_settings WHERE key = 'admin_whatsapp'",
  ).get() as { value: string } | undefined;
  const adminPhone = whatsappRow?.value || "0566866805";
  const internationalRecipient = toInternationalPhone(String(invitation.phone));
  const internationalAdmin = toInternationalPhone(adminPhone);
  if (!internationalRecipient || !internationalAdmin) {
    res.status(500).json({ error: "رقم واتساب التواصل في إعدادات الدليل غير صالح." });
    return;
  }
  const message = [
    `السلام عليكم ${invitation.fullName}،`,
    "ندعوك للانضمام إلى دليل موردي المخابز والحلويات المجاني لأصحاب المخابز والحلويات والمقاهي.",
    "لا توجد رسوم وسيط أو عمولة على التواصل مع الموردين.",
    `رابط تفعيل حسابك: ${url}`,
    `للاستفسار مع فريق الدليل: ${adminPhone}`,
    "",
    "ملاحظة: ستراجع الرسالة وتضغط إرسال بنفسك، ولا يستطيع النظام تأكيد وصولها.",
  ].join("\n");
  res.json(GetBuyerInvitationLinkResponse.parse({
    token,
    fullName: invitation.fullName,
    phone: invitation.phone,
    url,
    whatsappUrl: `https://wa.me/${internationalRecipient}?text=${encodeURIComponent(message)}`,
  }));
});

router.post("/admin/buyer-invitations/:id/sent", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const params = MarkBuyerInvitationSentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "معرّف الدعوة غير صالح." });
    return;
  }
  const invitation = getInvitation(params.data.id);
  if (!invitation) {
    res.status(404).json({ error: "الدعوة غير موجودة." });
    return;
  }
  if (invitation.buyerId != null) {
    res.status(409).json({ error: "تم تفعيل هذه الدعوة بالفعل." });
    return;
  }
  directoryDb.prepare(
    "UPDATE buyer_invitations SET invite_sent_at = COALESCE(invite_sent_at, ?) WHERE id = ?",
  ).run(new Date().toISOString(), params.data.id);
  res.json(MarkBuyerInvitationSentResponse.parse({
    success: true,
    message: "تم فتح رابط واتساب. لا يمكن للنظام التحقق من إرسال الرسالة فعلياً.",
  }));
});

router.get("/admin/buyer-invitations/stats", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  restoreExpiredBuyerSuspensions();
  const counts = directoryDb.prepare(`
    SELECT
      SUM(CASE WHEN ${accountStatusSql} = 'invited' THEN 1 ELSE 0 END) AS invited,
      SUM(CASE WHEN ${accountStatusSql} = 'activated' THEN 1 ELSE 0 END) AS activated,
      SUM(CASE WHEN ${accountStatusSql} = 'active' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN ${accountStatusSql} = 'suspended' THEN 1 ELSE 0 END) AS suspended
    FROM buyer_invitations bi
    LEFT JOIN buyer_users bu ON bu.id = bi.buyer_id
  `).get() as Record<string, number | null>;
  const topSearches = directoryDb.prepare(`
    SELECT search_term AS term, COUNT(*) AS count
    FROM buyer_search_logs
    WHERE searched_at >= datetime('now', '-30 days')
    GROUP BY search_term ORDER BY count DESC, term COLLATE NOCASE LIMIT 8
  `).all() as Array<{ term: string; count: number }>;
  const dailyContactAttempts = directoryDb.prepare(`
    SELECT date(sent_at) AS date, COUNT(*) AS count
    FROM contact_logs
    WHERE sent_at >= datetime('now', '-14 days')
    GROUP BY date(sent_at) ORDER BY date(sent_at)
  `).all() as Array<{ date: string; count: number }>;
  res.json(GetBuyerInvitationStatsResponse.parse({
    invited: Number(counts.invited ?? 0),
    activated: Number(counts.activated ?? 0),
    active: Number(counts.active ?? 0),
    suspended: Number(counts.suspended ?? 0),
    topSearches,
    dailyContactAttempts,
  }));
});

router.get("/admin/buyer-invitations/export", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const query = ExportBuyerInvitationsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "حالة الدعوة غير صالحة للتصدير." });
    return;
  }
  restoreExpiredBuyerSuspensions();
  const rows = directoryDb.prepare(`
    SELECT bi.full_name AS fullName, bi.phone, bi.business_name AS businessName,
      bi.business_type AS businessType, bi.city, bi.internal_notes AS internalNotes,
      bi.invited_at AS invitedAt, bi.created_by AS createdBy,
      bi.invite_sent_at AS inviteSentAt, bi.activated_at AS activatedAt,
      ${accountStatusSql} AS accountStatus, bu.last_login AS lastLogin,
      bu.suspended_until AS suspendedUntil
    FROM buyer_invitations bi
    LEFT JOIN buyer_users bu ON bu.id = bi.buyer_id
    ${query.data.status ? `WHERE ${accountStatusSql} = ?` : ""}
    ORDER BY bi.created_at DESC, bi.id DESC
  `).all(...(query.data.status ? [query.data.status] : [])) as Array<Record<string, unknown>>;
  const csv = [
    ["الاسم", "الجوال", "المنشأة", "النشاط", "المدينة", "الحالة", "تاريخ الدعوة", "تاريخ الإرسال", "تاريخ التفعيل", "آخر دخول", "الإيقاف حتى", "المنشئ", "ملاحظات"],
    ...rows.map((row) => [
      row.fullName, row.phone, row.businessName, row.businessType, row.city, row.accountStatus,
      row.invitedAt, row.inviteSentAt, row.activatedAt, row.lastLogin, row.suspendedUntil,
      row.createdBy, row.internalNotes,
    ]),
  ].map((row) => row.map(csvCell).join(",")).join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="buyer-invitations.csv"');
  res.send(`\uFEFF${csv}`);
});

router.patch("/admin/buyer-invitations/:id/account-status", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const params = UpdateInvitedBuyerAccountStatusParams.safeParse(req.params);
  const parsed = UpdateInvitedBuyerAccountStatusBody.safeParse(req.body);
  if (!params.success || !parsed.success ||
      (parsed.data.status === "suspended" && !parsed.data.durationDays)) {
    res.status(400).json({ error: "حدد حالة صحيحة ومدة من يوم إلى 90 يوماً للإيقاف المؤقت." });
    return;
  }
  restoreExpiredBuyerSuspensions();
  const invitation = getInvitation(params.data.id);
  if (!invitation || invitation.buyerId == null) {
    res.status(404).json({ error: "لم يتم العثور على حساب مفعّل لهذه الدعوة." });
    return;
  }
  const buyerId = Number(invitation.buyerId);
  const current = directoryDb.prepare(`
    SELECT moderation_status AS status FROM buyer_users WHERE id = ?
  `).get(buyerId) as { status: string } | undefined;
  if (!current) {
    res.status(404).json({ error: "حساب صاحب العمل غير موجود." });
    return;
  }
  const now = new Date();
  const nowIso = now.toISOString();
  const nextStatus = parsed.data.status === "suspended" ? "suspended" : "active";
  const suspendedUntil = parsed.data.status === "suspended"
    ? new Date(now.getTime() + Number(parsed.data.durationDays) * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const reason = parsed.data.status === "suspended" ? parsed.data.reason?.trim() || null : null;
  directoryDb.exec("BEGIN IMMEDIATE");
  try {
    directoryDb.prepare(`
      UPDATE buyer_users SET moderation_status = ?, moderation_reason = ?,
        moderation_updated_at = ?, suspended_until = ? WHERE id = ?
    `).run(nextStatus, reason, nowIso, suspendedUntil, buyerId);
    directoryDb.prepare(`
      INSERT INTO buyer_moderation_decisions
        (buyer_id, previous_status, new_status, reason, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(buyerId, current.status, nextStatus, reason, nowIso);
    directoryDb.exec("COMMIT");
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
  res.json(UpdateInvitedBuyerAccountStatusResponse.parse({
    success: true,
    message: nextStatus === "suspended" ? "تم إيقاف الحساب مؤقتاً." : "تمت إعادة تفعيل الحساب.",
  }));
});

router.get("/buyer-invites/:token", (req, res): void => {
  const params = GetBuyerInvitationParams.safeParse({
    token: Array.isArray(req.params.token) ? req.params.token[0] : req.params.token,
  });
  if (!params.success) {
    res.status(404).json({ error: "رابط الدعوة غير صالح أو غير متاح." });
    return;
  }
  const tokenHash = hashToken(params.data.token);
  const invitation = directoryDb.prepare(`
    SELECT full_name AS fullName, business_name AS businessName,
      business_type AS businessType, city, buyer_id AS buyerId
    FROM buyer_invitations WHERE token_hash = ?
  `).get(tokenHash) as {
    fullName: string; businessName: string; businessType: string; city: string; buyerId: number | null;
  } | undefined;
  if (!invitation) {
    res.status(404).json({ error: "رابط الدعوة غير صالح أو غير متاح." });
    return;
  }
  res.json(GetBuyerInvitationResponse.parse({
    fullName: invitation.fullName,
    businessName: invitation.businessName,
    businessType: invitation.businessType,
    city: invitation.city,
    alreadyActivated: invitation.buyerId != null,
  }));
});

router.post("/buyer-invites/:token/activate", (req, res): void => {
  const params = ActivateBuyerInvitationParams.safeParse({
    token: Array.isArray(req.params.token) ? req.params.token[0] : req.params.token,
  });
  const parsed = ActivateBuyerInvitationBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "أكمل بيانات التفعيل ووافق على الشروط." });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  if ((email && (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
      (parsed.data.newsletterWeekly && !email)) {
    res.status(400).json({ error: "أدخل بريداً إلكترونياً صالحاً للاشتراك في النشرة." });
    return;
  }
  const tokenHash = hashToken(params.data.token);
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN IMMEDIATE");
  try {
    const invitation = directoryDb.prepare(`
      SELECT id, full_name AS fullName, phone, business_name AS businessName,
        business_type AS businessType, city, buyer_id AS buyerId
      FROM buyer_invitations WHERE token_hash = ?
    `).get(tokenHash) as {
      id: number; fullName: string; phone: string; businessName: string;
      businessType: string; city: string; buyerId: number | null;
    } | undefined;
    if (!invitation) {
      directoryDb.exec("ROLLBACK");
      res.status(404).json({ error: "رابط الدعوة غير صالح أو غير متاح." });
      return;
    }
    if (invitation.buyerId != null) {
      directoryDb.exec("ROLLBACK");
      res.status(409).json({ error: "تم تفعيل هذه الدعوة بالفعل." });
      return;
    }
    if (directoryDb.prepare("SELECT id FROM buyer_users WHERE phone = ?").get(invitation.phone)) {
      directoryDb.exec("ROLLBACK");
      res.status(409).json({ error: "رقم الجوال مستخدم مسبقاً. تواصل مع الإدارة للمساعدة." });
      return;
    }
    if (email && directoryDb.prepare("SELECT id FROM buyer_users WHERE email = ?").get(email)) {
      directoryDb.exec("ROLLBACK");
      res.status(409).json({ error: "البريد الإلكتروني مستخدم مسبقاً." });
      return;
    }

    const salt = randomBytes(16);
    const passwordHash = `scrypt$${salt.toString("hex")}$${scryptSync(parsed.data.password, salt, 64).toString("hex")}`;
    const buyerResult = directoryDb.prepare(`
      INSERT INTO buyer_users
        (full_name, phone, email, city, business_type, business_name, is_owner,
         password_hash, created_at, last_login, moderation_status)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, NULL, 'active')
    `).run(
      invitation.fullName,
      invitation.phone,
      email || null,
      invitation.city,
      invitation.businessType,
      invitation.businessName,
      passwordHash,
      now,
    );
    const buyerId = Number(buyerResult.lastInsertRowid);
    const temporaryCode = `TEMP-${randomUUID()}`;
    const requestResult = directoryDb.prepare(`
      INSERT INTO buyer_requests
        (request_code, full_name, phone, email, city, business_type, business_name,
         other_business_type, is_owner, job_title, referral_source, newsletter_weekly,
         buyers_group, terms_accepted, terms_accepted_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, NULL, 'دعوة الإدارة', ?, ?, 1, ?, ?)
    `).run(
      temporaryCode,
      invitation.fullName,
      invitation.phone,
      email || null,
      invitation.city,
      invitation.businessType,
      invitation.businessName,
      parsed.data.newsletterWeekly ? 1 : 0,
      parsed.data.buyersGroup ? 1 : 0,
      now,
      now,
    );
    const requestId = Number(requestResult.lastInsertRowid);
    directoryDb.prepare("UPDATE buyer_requests SET request_code = ? WHERE id = ?")
      .run(`REQ-${new Date().getFullYear()}-${String(requestId).padStart(3, "0")}`, requestId);
    directoryDb.prepare(`
      UPDATE buyer_invitations SET buyer_id = ?, activated_at = ? WHERE id = ?
    `).run(buyerId, now, invitation.id);
    directoryDb.exec("COMMIT");
    res.status(201).json(ActivateBuyerInvitationResponse.parse({
      success: true,
      message: "تم إنشاء الحساب بنجاح. يمكنك الآن تسجيل الدخول.",
    }));
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed: buyer_users.phone")) {
      res.status(409).json({ error: "رقم الجوال مستخدم مسبقاً." });
      return;
    }
    if (message.includes("UNIQUE constraint failed: buyer_users.email")) {
      res.status(409).json({ error: "البريد الإلكتروني مستخدم مسبقاً." });
      return;
    }
    res.status(500).json({ error: "تعذر إنشاء الحساب حالياً." });
  }
});

export default router;