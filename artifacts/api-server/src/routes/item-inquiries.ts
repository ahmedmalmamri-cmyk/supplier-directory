import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import {
  CloseBuyerItemInquiryParams,
  CloseBuyerItemInquiryResponse,
  CreateBuyerItemInquiryBody,
  CreateBuyerItemInquiryContactParams,
  CreateBuyerItemInquiryContactResponse,
  CreateBuyerItemInquiryPhotoUploadUrlBody,
  CreateBuyerItemInquiryPhotoUploadUrlResponse,
  CreateBuyerItemInquiryResponse,
  GetBuyerItemInquiryMatchesQueryParams,
  GetBuyerItemInquiryMatchesResponse,
  ListBuyerItemInquiriesResponse,
  ListSupplierItemInquiriesResponse,
  UpsertSupplierItemInquiryReplyBody,
  UpsertSupplierItemInquiryReplyParams,
  UpsertSupplierItemInquiryReplyResponse,
} from "@workspace/api-zod";
import { directoryDb } from "../lib/directory-db";
import { getBuyerIdFromRequest } from "../lib/buyer-auth";
import { getSupplierIdFromRequest } from "../lib/supplier-auth";
import { getTestModeSession, isTestModeRequest } from "../lib/test-mode";
import {
  assertInquiryPhotoUploaded,
  createInquiryPhotoUpload,
  InquiryPhotoStorageError,
  InquiryPhotoValidationError,
  streamInquiryPhoto,
} from "../lib/item-inquiry-photo-storage";
import { recordSupplierStat } from "../lib/supplier-stats";
import { publicSupplierTaxonomyCtes } from "../lib/public-supplier-taxonomy";
import { publicCatalogVisibilitySql } from "../lib/catalog-visibility";

const router: IRouter = Router();
const inquiryLifetimeMs = 14 * 24 * 60 * 60 * 1000;
const photoUploadLifetimeMs = 14 * 60 * 1000;

type BuyerSession = {
  id: number;
  fullName: string;
  phone: string;
  city: string;
  businessType: string;
  businessName: string | null;
  otherBusinessType: string | null;
  isOwner: number;
  jobTitle: string | null;
  moderationStatus: string;
};

type SupplierSession = {
  id: number;
  name: string;
  city: string;
  phone: string;
  whatsapp: string;
};

type InquiryDbRow = {
  id: number;
  itemId: number;
  itemName: string;
  brandOrType: string;
  city: string;
  allowAlternatives: number;
  packageDetails: string | null;
  note: string | null;
  quantity: number | null;
  photoPath: string | null;
  businessName: string | null;
  status: "active" | "closed" | "expired";
  createdAt: string;
  expiresAt: string;
};

type ReplyDbRow = {
  supplierId: number;
  supplierBusinessName: string;
  responseStatus: "available" | "unavailable" | "alternative";
  price: number | null;
  packageDetails: string | null;
  branchAddress: string | null;
  note: string | null;
  respondedAt: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown): string | null {
  const normalized = text(value);
  return normalized || null;
}

function getBuyerSession(req: Request, res: Response): BuyerSession | null {
  if (isTestModeRequest(req, "supplier")) {
    res.status(401).json({ error: "جلسة صاحب العمل غير متاحة أثناء معاينة المورد." });
    return null;
  }
  const testSession = getTestModeSession(req);
  const buyerId = getBuyerIdFromRequest(req)
    ?? (testSession?.role === "buyer" ? testSession.id : null);
  if (!buyerId) {
    res.status(401).json({ error: "يجب تسجيل الدخول بحساب صاحب عمل أولاً." });
    return null;
  }

  const buyer = directoryDb.prepare(`
    SELECT id, full_name AS fullName, phone, city, business_type AS businessType,
      business_name AS businessName, other_business_type AS otherBusinessType,
      is_owner AS isOwner, job_title AS jobTitle, moderation_status AS moderationStatus
    FROM buyer_users
    WHERE id = ?
  `).get(buyerId) as BuyerSession | undefined;
  if (!buyer) {
    res.status(401).json({ error: "جلسة المستخدم غير صالحة." });
    return null;
  }
  return buyer;
}

function requireActiveBuyer(buyer: BuyerSession, res: Response): boolean {
  if (buyer.moderationStatus !== "active") {
    res.status(403).json({ error: "لا يمكن استخدام استفسارات التوفر حتى تصبح حالة حسابك نشطة." });
    return false;
  }
  return true;
}

function requireOwner(buyer: BuyerSession, res: Response): boolean {
  if (buyer.isOwner !== 1) {
    res.status(403).json({ error: "إنشاء استفسارات التوفر متاح لصاحب العمل فقط." });
    return false;
  }
  return true;
}

function requireSupplierSession(req: Request, res: Response): { supplierId: number; supplier: SupplierSession } | null {
  if (isTestModeRequest(req, "buyer")) {
    res.status(401).json({ error: "جلسة المورد غير متاحة أثناء معاينة صاحب العمل." });
    return null;
  }
  const supplierId = getSupplierIdFromRequest(req);
  if (!supplierId) {
    res.status(401).json({ error: "يجب تسجيل دخول المورد أولاً." });
    return null;
  }
  const supplier = directoryDb.prepare(`
    SELECT s.id, s.name, s.city, s.phone, s.whatsapp
    FROM suppliers s
    JOIN supplier_users su ON su.supplier_id = s.id
    WHERE s.id = ? AND su.status = 'active' AND s.is_active = 1
  `).get(supplierId) as SupplierSession | undefined;
  if (!supplier) {
    res.status(403).json({ error: "حساب المورد غير نشط أو غير مخوّل." });
    return null;
  }
  return { supplierId, supplier };
}

function requireRealBuyerMutation(req: Request, buyer: BuyerSession, res: Response): boolean {
  if (isTestModeRequest(req, "buyer")) {
    res.status(403).json({ error: "لا يمكن حفظ استفسار أو تنفيذ تواصل حقيقي من وضع المعاينة." });
    return false;
  }
  return true;
}

function requireRealSupplierMutation(req: Request, supplierId: number, res: Response): boolean {
  if (isTestModeRequest(req, "supplier", supplierId)) {
    res.status(403).json({ error: "لا يمكن حفظ رد حقيقي من وضع المعاينة." });
    return false;
  }
  return true;
}

function validateConfiguredCity(city: string): boolean {
  const row = directoryDb.prepare(
    "SELECT value FROM directory_settings WHERE key = 'available_cities'",
  ).get() as { value: string } | undefined;
  if (!row) throw new Error("Available cities are not configured.");
  let cities: unknown;
  try {
    cities = JSON.parse(row.value);
  } catch {
    throw new Error("Available cities configuration is invalid.");
  }
  if (!Array.isArray(cities) || cities.some((entry) => typeof entry !== "string")) {
    throw new Error("Available cities configuration is invalid.");
  }
  return cities.some((entry) => entry.trim() === city);
}

function getActiveTaxonomyItem(itemId: number): { id: number; name: string } | undefined {
  return directoryDb.prepare(`
    ${publicSupplierTaxonomyCtes}
    SELECT item.id, item.name
    FROM supplier_taxonomy_items item
    WHERE item.id = ? AND item.is_active = 1
      AND item.category_id IN (SELECT id FROM active_nodes)
  `).get(itemId) as { id: number; name: string } | undefined;
}

const matchingSuppliersSql = `
  WITH RECURSIVE active_taxonomy_nodes(id) AS (
    SELECT id
    FROM supplier_taxonomy_nodes
    WHERE parent_id IS NULL AND is_active = 1
    UNION ALL
    SELECT child.id
    FROM supplier_taxonomy_nodes child
    JOIN active_taxonomy_nodes parent ON child.parent_id = parent.id
    WHERE child.is_active = 1
  )
  SELECT DISTINCT supplier.id
  FROM suppliers supplier
  JOIN supplier_users supplier_user
    ON supplier_user.supplier_id = supplier.id AND supplier_user.status = 'active'
  JOIN supplier_taxonomy_item_suppliers item_link
    ON item_link.supplier_id = supplier.id AND item_link.item_id = ?
  JOIN supplier_taxonomy_items item
    ON item.id = item_link.item_id AND item.is_active = 1
  WHERE supplier.is_active = 1 AND supplier.city = ?
    AND item.category_id IN (SELECT id FROM active_taxonomy_nodes)
    AND ${publicCatalogVisibilitySql("supplier")}
  ORDER BY supplier.id
`;

function photoUrl(inquiryId: number, photoPath: string | null): string | null {
  return photoPath ? `/api/item-inquiries/${inquiryId}/photo` : null;
}

function getInquiryRows(whereClause: string, values: Array<string | number>): InquiryDbRow[] {
  return directoryDb.prepare(`
    SELECT inquiry.id, inquiry.item_id AS itemId, item.name AS itemName,
      inquiry.brand_or_type AS brandOrType, inquiry.city,
      inquiry.allow_alternatives AS allowAlternatives,
      inquiry.package_details AS packageDetails, inquiry.note,
      inquiry.quantity, inquiry.photo_path AS photoPath,
      buyer.business_name AS businessName, inquiry.status,
      inquiry.created_at AS createdAt, inquiry.expires_at AS expiresAt
    FROM item_availability_inquiries inquiry
    JOIN supplier_taxonomy_items item ON item.id = inquiry.item_id
    JOIN buyer_users buyer ON buyer.id = inquiry.buyer_id
    ${whereClause}
    ORDER BY inquiry.created_at DESC, inquiry.id DESC
  `).all(...values) as InquiryDbRow[];
}

function getReplies(inquiryId: number): ReplyDbRow[] {
  return directoryDb.prepare(`
    SELECT reply.supplier_id AS supplierId, supplier.name AS supplierBusinessName,
      reply.response_status AS responseStatus, reply.price,
      reply.package_details AS packageDetails,
      reply.branch_address AS branchAddress, reply.note,
      reply.responded_at AS respondedAt
    FROM item_availability_replies reply
    JOIN suppliers supplier ON supplier.id = reply.supplier_id
    WHERE reply.inquiry_id = ?
    ORDER BY
      CASE reply.response_status WHEN 'available' THEN 0 WHEN 'alternative' THEN 1 ELSE 2 END,
      reply.price ASC, supplier.name COLLATE NOCASE
  `).all(inquiryId) as ReplyDbRow[];
}

function toPublicReply(reply: ReplyDbRow) {
  return {
    ...reply,
    currency: "SAR" as const,
  };
}

function inquiryStatus(row: InquiryDbRow, now: string): "active" | "closed" | "expired" {
  if (row.status === "active" && row.expiresAt <= now) return "expired";
  return row.status;
}

function toPublicInquiry(row: InquiryDbRow, now: string, includeReplies: boolean) {
  return {
    id: row.id,
    itemId: row.itemId,
    itemName: row.itemName,
    brandOrType: row.brandOrType,
    city: row.city,
    allowAlternatives: row.allowAlternatives === 1,
    packageDetails: row.packageDetails,
    note: row.note,
    quantity: row.quantity,
    photoUrl: photoUrl(row.id, row.photoPath),
    businessName: row.businessName,
    status: inquiryStatus(row, now),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    ...(includeReplies ? { replies: getReplies(row.id).map(toPublicReply) } : {}),
  };
}

function replyTransaction<T>(callback: () => T): T {
  directoryDb.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    directoryDb.exec("COMMIT");
    return result;
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    throw error;
  }
}

router.get("/buyer/item-inquiries/matches", (req, res): void => {
  const buyer = getBuyerSession(req, res);
  if (!buyer || !requireActiveBuyer(buyer, res)) return;

  const parsed = GetBuyerItemInquiryMatchesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "حدد الصنف والمدينة بصورة صحيحة." });
    return;
  }
  const item = getActiveTaxonomyItem(parsed.data.itemId);
  if (!item) {
    res.status(400).json({ error: "الصنف المحدد غير متاح." });
    return;
  }
  let validCity: boolean;
  try {
    validCity = validateConfiguredCity(parsed.data.city);
  } catch {
    res.status(500).json({ error: "تعذر التحقق من قائمة المدن حالياً." });
    return;
  }
  if (!validCity) {
    res.status(400).json({ error: "المدينة المحددة غير متاحة." });
    return;
  }

  const suppliers = directoryDb.prepare(matchingSuppliersSql)
    .all(item.id, parsed.data.city) as Array<{ id: number }>;
  res.json(GetBuyerItemInquiryMatchesResponse.parse({
    itemId: item.id,
    city: parsed.data.city,
    count: suppliers.length,
  }));
});

router.post("/buyer/item-inquiries", async (req, res): Promise<void> => {
  const buyer = getBuyerSession(req, res);
  if (!buyer || !requireActiveBuyer(buyer, res)) return;
  if (!requireOwner(buyer, res)) return;
  if (!requireRealBuyerMutation(req, buyer, res)) return;

  const parsed = CreateBuyerItemInquiryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "راجع الصنف والنوع والمدينة وتفاصيل الاستفسار." });
    return;
  }
  const input = parsed.data;
  const brandOrType = text(input.brandOrType);
  const city = text(input.city);
  const packageDetails = optionalText(input.packageDetails);
  const note = optionalText(input.note);
  if (!brandOrType) {
    res.status(400).json({ error: "اكتب اسم العلامة أو النوع المطلوب بدقة." });
    return;
  }
  const item = getActiveTaxonomyItem(input.itemId);
  if (!item) {
    res.status(404).json({ error: "الصنف الأساسي المحدد غير متاح." });
    return;
  }
  let validCity: boolean;
  try {
    validCity = validateConfiguredCity(city);
  } catch {
    res.status(500).json({ error: "تعذر التحقق من قائمة المدن حالياً." });
    return;
  }
  if (!validCity) {
    res.status(400).json({ error: "المدينة المحددة غير متاحة." });
    return;
  }
  if (input.photoPath) {
    const upload = directoryDb.prepare(`
      SELECT buyer_id AS buyerId, expires_at AS expiresAt, consumed_at AS consumedAt
      FROM item_availability_photo_uploads
      WHERE object_path = ?
    `).get(input.photoPath) as {
      buyerId: number;
      expiresAt: string;
      consumedAt: string | null;
    } | undefined;
    if (!upload || upload.buyerId !== buyer.id) {
      res.status(403).json({ error: "صورة المنتج غير مرتبطة بجلسة صاحب العمل الحالية." });
      return;
    }
    if (upload.consumedAt || upload.expiresAt <= new Date().toISOString()) {
      res.status(409).json({ error: "انتهت صلاحية رفع الصورة أو سبق استخدامها." });
      return;
    }
    try {
      await assertInquiryPhotoUploaded(input.photoPath);
    } catch (error) {
      if (error instanceof InquiryPhotoValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(503).json({ error: "تعذر التحقق من صورة المنتج حالياً." });
      return;
    }
  }

  let inquiryId: number;
  try {
    inquiryId = replyTransaction(() => {
      const recipients = directoryDb.prepare(matchingSuppliersSql)
        .all(item.id, city) as Array<{ id: number }>;
      if (recipients.length === 0) {
        throw new Error("NO_MATCHING_SUPPLIERS");
      }

      const createdAt = new Date().toISOString();
      if (input.photoPath) {
        const upload = directoryDb.prepare(`
          SELECT buyer_id AS buyerId, expires_at AS expiresAt, consumed_at AS consumedAt
          FROM item_availability_photo_uploads
          WHERE object_path = ?
        `).get(input.photoPath) as {
          buyerId: number;
          expiresAt: string;
          consumedAt: string | null;
        } | undefined;
        if (!upload || upload.buyerId !== buyer.id) {
          throw new Error("PHOTO_UPLOAD_NOT_OWNED");
        }
        if (upload.consumedAt || upload.expiresAt <= createdAt) {
          throw new Error("PHOTO_UPLOAD_UNAVAILABLE");
        }
      }
      const expiresAt = new Date(Date.now() + inquiryLifetimeMs).toISOString();
      const inserted = directoryDb.prepare(`
        INSERT INTO item_availability_inquiries
          (buyer_id, item_id, brand_or_type, city, allow_alternatives,
           package_details, note, quantity, photo_path, status, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
      `).run(
        buyer.id,
        item.id,
        brandOrType,
        city,
        input.allowAlternatives ? 1 : 0,
        packageDetails,
        note,
        input.quantity ?? null,
        input.photoPath ?? null,
        createdAt,
        expiresAt,
      );
      const id = Number(inserted.lastInsertRowid);
      const insertRecipient = directoryDb.prepare(`
        INSERT INTO item_availability_recipients (inquiry_id, supplier_id)
        VALUES (?, ?)
      `);
      for (const recipient of recipients) insertRecipient.run(id, recipient.id);
      if (input.photoPath) {
        const consumed = directoryDb.prepare(`
          UPDATE item_availability_photo_uploads
          SET consumed_at = ?
          WHERE object_path = ? AND buyer_id = ?
            AND consumed_at IS NULL AND expires_at > ?
        `).run(createdAt, input.photoPath, buyer.id, createdAt);
        if (consumed.changes !== 1) throw new Error("PHOTO_UPLOAD_UNAVAILABLE");
      }
      return id;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_MATCHING_SUPPLIERS") {
      res.status(409).json({ error: "لا يوجد مورد نشط لهذا الصنف في المدينة المحددة." });
      return;
    }
    if (error instanceof Error && error.message === "PHOTO_UPLOAD_NOT_OWNED") {
      res.status(403).json({ error: "صورة المنتج غير مرتبطة بجلسة صاحب العمل الحالية." });
      return;
    }
    if (error instanceof Error && error.message === "PHOTO_UPLOAD_UNAVAILABLE") {
      res.status(409).json({ error: "انتهت صلاحية رفع الصورة أو سبق استخدامها." });
      return;
    }
    res.status(500).json({ error: "تعذر حفظ استفسار التوفر حالياً." });
    return;
  }

  const row = getInquiryRows("WHERE inquiry.id = ? AND inquiry.buyer_id = ?", [inquiryId, buyer.id])[0];
  res.status(201).json(CreateBuyerItemInquiryResponse.parse(toPublicInquiry(row, new Date().toISOString(), true)));
});

router.get("/buyer/item-inquiries", (req, res): void => {
  const buyer = getBuyerSession(req, res);
  if (!buyer || !requireActiveBuyer(buyer, res)) return;
  const rows = getInquiryRows("WHERE inquiry.buyer_id = ?", [buyer.id]);
  const now = new Date().toISOString();
  res.json(ListBuyerItemInquiriesResponse.parse(rows.map((row) => toPublicInquiry(row, now, true))));
});

router.patch("/buyer/item-inquiries/:id/close", (req, res): void => {
  const buyer = getBuyerSession(req, res);
  if (!buyer || !requireActiveBuyer(buyer, res)) return;
  if (!requireOwner(buyer, res)) return;
  if (!requireRealBuyerMutation(req, buyer, res)) return;
  const parsed = CloseBuyerItemInquiryParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "معرّف الاستفسار غير صحيح." });
    return;
  }
  const current = directoryDb.prepare(`
    SELECT status, expires_at AS expiresAt
    FROM item_availability_inquiries WHERE id = ? AND buyer_id = ?
  `).get(parsed.data.id, buyer.id) as { status: string; expiresAt: string } | undefined;
  if (!current) {
    res.status(403).json({ error: "لا تملك صلاحية إغلاق هذا الاستفسار." });
    return;
  }
  if (current.status !== "active" || current.expiresAt <= new Date().toISOString()) {
    res.status(404).json({ error: "هذا الاستفسار مغلق أو منتهي الصلاحية." });
    return;
  }
  directoryDb.prepare(`
    UPDATE item_availability_inquiries
    SET status = 'closed'
    WHERE id = ? AND buyer_id = ? AND status = 'active'
  `).run(parsed.data.id, buyer.id);
  res.json(CloseBuyerItemInquiryResponse.parse({ success: true, status: "closed" }));
});

router.get("/supplier/item-inquiries", (req, res): void => {
  const session = requireSupplierSession(req, res);
  if (!session) return;
  const now = new Date().toISOString();
  const rows = getInquiryRows(`
    JOIN item_availability_recipients recipient
      ON recipient.inquiry_id = inquiry.id AND recipient.supplier_id = ?
    JOIN supplier_users supplier_user
      ON supplier_user.supplier_id = recipient.supplier_id AND supplier_user.status = 'active'
    JOIN suppliers supplier
      ON supplier.id = recipient.supplier_id AND supplier.is_active = 1
    WHERE inquiry.status = 'active' AND inquiry.expires_at > ?
      AND buyer.is_owner = 1 AND buyer.moderation_status = 'active'
  `, [session.supplierId, now]);
  const replyQuery = directoryDb.prepare(`
    SELECT reply.supplier_id AS supplierId, supplier.name AS supplierBusinessName,
      reply.response_status AS responseStatus, reply.price,
      reply.package_details AS packageDetails,
      reply.branch_address AS branchAddress, reply.note,
      reply.responded_at AS respondedAt
    FROM item_availability_replies reply
    JOIN suppliers supplier ON supplier.id = reply.supplier_id
    WHERE reply.inquiry_id = ? AND reply.supplier_id = ?
  `);
  const result = rows.map((row) => {
    const reply = replyQuery.get(row.id, session.supplierId) as ReplyDbRow | undefined;
    return {
      ...toPublicInquiry(row, now, false),
      ownReply: reply ? toPublicReply(reply) : null,
    };
  });
  res.json(ListSupplierItemInquiriesResponse.parse(result));
});

router.put("/supplier/item-inquiries/:id/reply", (req, res): void => {
  const session = requireSupplierSession(req, res);
  if (!session) return;
  if (!requireRealSupplierMutation(req, session.supplierId, res)) return;
  const params = UpsertSupplierItemInquiryReplyParams.safeParse(req.params);
  const parsed = UpsertSupplierItemInquiryReplyBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "راجع حالة التوفر والسعر وبيانات نقطة البيع." });
    return;
  }
  const input = parsed.data;
  const inquiry = directoryDb.prepare(`
    SELECT inquiry.allow_alternatives AS allowAlternatives,
      inquiry.expires_at AS expiresAt, buyer.is_owner AS isOwner,
      buyer.moderation_status AS moderationStatus
    FROM item_availability_recipients recipient
    JOIN item_availability_inquiries inquiry ON inquiry.id = recipient.inquiry_id
    JOIN buyer_users buyer ON buyer.id = inquiry.buyer_id
    WHERE recipient.inquiry_id = ? AND recipient.supplier_id = ?
      AND inquiry.status = 'active'
  `).get(params.data.id, session.supplierId) as {
    allowAlternatives: number;
    expiresAt: string;
    isOwner: number;
    moderationStatus: string;
  } | undefined;
  if (!inquiry) {
    const recipient = directoryDb.prepare(`
      SELECT 1 FROM item_availability_recipients
      WHERE inquiry_id = ? AND supplier_id = ?
    `).get(params.data.id, session.supplierId);
    if (!recipient) {
      res.status(403).json({ error: "لم يُرسل هذا الاستفسار إلى حساب المورد." });
      return;
    }
    res.status(404).json({ error: "هذا الاستفسار مغلق أو غير متاح للرد." });
    return;
  }
  if (inquiry.expiresAt <= new Date().toISOString() ||
      inquiry.isOwner !== 1 || inquiry.moderationStatus !== "active") {
    res.status(404).json({ error: "هذا الاستفسار منتهي الصلاحية أو غير متاح للرد." });
    return;
  }
  if (input.responseStatus === "alternative" && inquiry.allowAlternatives !== 1) {
    res.status(400).json({ error: "صاحب العمل لا يقبل البدائل لهذا الاستفسار." });
    return;
  }
  const price = input.responseStatus === "unavailable" ? null : input.price ?? null;
  const packageDetails = optionalText(input.packageDetails);
  const branchAddress = optionalText(input.branchAddress);
  const note = optionalText(input.note);
  if (input.responseStatus === "unavailable") {
    if (input.price !== undefined) {
      res.status(400).json({ error: "لا ترفق سعراً برد «غير متوفر»." });
      return;
    }
  } else if (price === null || !branchAddress) {
    res.status(400).json({ error: "أدخل سعر العبوة وعنوان نقطة البيع." });
    return;
  }

  const respondedAt = new Date().toISOString();
  let reply: ReplyDbRow;
  try {
    reply = replyTransaction(() => {
      const stillActive = directoryDb.prepare(`
        SELECT inquiry.allow_alternatives AS allowAlternatives,
          inquiry.expires_at AS expiresAt, buyer.is_owner AS isOwner,
          buyer.moderation_status AS moderationStatus
        FROM item_availability_recipients recipient
        JOIN item_availability_inquiries inquiry ON inquiry.id = recipient.inquiry_id
        JOIN buyer_users buyer ON buyer.id = inquiry.buyer_id
        WHERE recipient.inquiry_id = ? AND recipient.supplier_id = ?
          AND inquiry.status = 'active'
      `).get(params.data.id, session.supplierId) as {
        allowAlternatives: number;
        expiresAt: string;
        isOwner: number;
        moderationStatus: string;
      } | undefined;
      if (!stillActive || stillActive.expiresAt <= new Date().toISOString() ||
          stillActive.isOwner !== 1 || stillActive.moderationStatus !== "active") {
        throw new Error("INQUIRY_NO_LONGER_REPLYABLE");
      }
      if (input.responseStatus === "alternative" && stillActive.allowAlternatives !== 1) {
        throw new Error("ALTERNATIVES_NOT_ALLOWED");
      }
      directoryDb.prepare(`
        INSERT INTO item_availability_replies
          (inquiry_id, supplier_id, response_status, price, package_details,
           branch_address, note, responded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(inquiry_id, supplier_id) DO UPDATE SET
          response_status = excluded.response_status,
          price = excluded.price,
          package_details = excluded.package_details,
          branch_address = excluded.branch_address,
          note = excluded.note,
          responded_at = excluded.responded_at
      `).run(
        params.data.id,
        session.supplierId,
        input.responseStatus,
        price,
        packageDetails,
        branchAddress,
        note,
        respondedAt,
      );
      return directoryDb.prepare(`
        SELECT reply.supplier_id AS supplierId, supplier.name AS supplierBusinessName,
          reply.response_status AS responseStatus, reply.price,
          reply.package_details AS packageDetails,
          reply.branch_address AS branchAddress, reply.note,
          reply.responded_at AS respondedAt
        FROM item_availability_replies reply
        JOIN suppliers supplier ON supplier.id = reply.supplier_id
        WHERE reply.inquiry_id = ? AND reply.supplier_id = ?
      `).get(params.data.id, session.supplierId) as ReplyDbRow;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INQUIRY_NO_LONGER_REPLYABLE") {
      res.status(404).json({ error: "هذا الاستفسار مغلق أو انتهت صلاحيته." });
      return;
    }
    if (error instanceof Error && error.message === "ALTERNATIVES_NOT_ALLOWED") {
      res.status(400).json({ error: "صاحب العمل لا يقبل البدائل لهذا الاستفسار." });
      return;
    }
    res.status(500).json({ error: "تعذر حفظ رد التوفر حالياً." });
    return;
  }
  res.json(UpsertSupplierItemInquiryReplyResponse.parse(toPublicReply(reply)));
});

router.post("/buyer/item-inquiries/photo-upload-url", async (req, res): Promise<void> => {
  const buyer = getBuyerSession(req, res);
  if (!buyer || !requireActiveBuyer(buyer, res)) return;
  if (!requireOwner(buyer, res)) return;
  if (!requireRealBuyerMutation(req, buyer, res)) return;
  const parsed = CreateBuyerItemInquiryPhotoUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "حدد صورة بصيغة وحجم مسموحين." });
    return;
  }
  try {
    const upload = await createInquiryPhotoUpload({
      contentType: parsed.data.contentType,
      size: parsed.data.size,
    });
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + photoUploadLifetimeMs).toISOString();
    directoryDb.prepare(`
      INSERT INTO item_availability_photo_uploads
        (object_path, buyer_id, expires_at, consumed_at, created_at)
      VALUES (?, ?, ?, NULL, ?)
    `).run(upload.objectPath, buyer.id, expiresAt, createdAt);
    res.json(CreateBuyerItemInquiryPhotoUploadUrlResponse.parse(upload));
  } catch (error) {
    if (error instanceof InquiryPhotoValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(503).json({ error: "تعذر تجهيز رفع الصورة حالياً." });
  }
});

router.get("/item-inquiries/:id/photo", async (req, res): Promise<void> => {
  const buyerSession = getBuyerIdFromRequest(req);
  const testSession = getTestModeSession(req);
  const buyerId = buyerSession ?? (testSession?.role === "buyer" ? testSession.id : null);
  const supplierId = getSupplierIdFromRequest(req);
  if (!buyerId && !supplierId) {
    res.status(401).json({ error: "سجّل الدخول لعرض صورة الاستفسار." });
    return;
  }
  if (supplierId && isTestModeRequest(req, "buyer")) {
    res.status(401).json({ error: "جلسة المورد غير متاحة أثناء معاينة صاحب العمل." });
    return;
  }
  const inquiryId = Number(req.params.id);
  if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
    res.status(404).json({ error: "الصورة غير متاحة." });
    return;
  }
  const inquiry = directoryDb.prepare(`
    SELECT inquiry.buyer_id AS buyerId, inquiry.photo_path AS photoPath,
      inquiry.status, inquiry.expires_at AS expiresAt,
      buyer.is_owner AS isOwner, buyer.moderation_status AS moderationStatus
    FROM item_availability_inquiries inquiry
    JOIN buyer_users buyer ON buyer.id = inquiry.buyer_id
    WHERE inquiry.id = ?
  `).get(inquiryId) as {
    buyerId: number;
    photoPath: string | null;
    status: string;
    expiresAt: string;
    isOwner: number;
    moderationStatus: string;
  } | undefined;
  if (!inquiry?.photoPath) {
    res.status(404).json({ error: "الصورة غير متاحة." });
    return;
  }
  if (buyerId !== null) {
    if (buyerId !== inquiry.buyerId || inquiry.isOwner !== 1 || inquiry.moderationStatus !== "active") {
      res.status(403).json({ error: "لا تملك صلاحية عرض هذه الصورة." });
      return;
    }
  } else if (supplierId) {
    const supplier = directoryDb.prepare(`
      SELECT 1
      FROM item_availability_recipients recipient
      JOIN suppliers supplier ON supplier.id = recipient.supplier_id
      JOIN supplier_users supplier_user ON supplier_user.supplier_id = supplier.id
      WHERE recipient.inquiry_id = ? AND recipient.supplier_id = ?
        AND supplier.is_active = 1 AND supplier_user.status = 'active'
        AND ? = 'active' AND ? > ?
        AND ? = 1 AND ? = 'active'
    `).get(
      inquiryId,
      supplierId,
      inquiry.status,
      inquiry.expiresAt,
      new Date().toISOString(),
      inquiry.isOwner,
      inquiry.moderationStatus,
    );
    if (!supplier) {
      res.status(403).json({ error: "لا تملك صلاحية عرض هذه الصورة." });
      return;
    }
  }
  try {
    const image = await streamInquiryPhoto(inquiry.photoPath);
    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Content-Length", String(image.contentLength));
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    image.stream.on("error", () => res.destroy());
    image.stream.pipe(res);
  } catch (error) {
    if (error instanceof InquiryPhotoValidationError) {
      res.status(404).json({ error: "الصورة غير متاحة." });
      return;
    }
    if (error instanceof InquiryPhotoStorageError) {
      res.status(503).json({ error: "تعذر تحميل الصورة حالياً." });
      return;
    }
    res.status(503).json({ error: "تعذر تحميل الصورة حالياً." });
  }
});

function normalizeSaudiPhone(value: string): string {
  const normalizedDigits = value.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const digits = normalizedDigits.replace(/\D/g, "");
  if (digits.startsWith("00966")) return `0${digits.slice(5)}`;
  if (digits.startsWith("966")) return `0${digits.slice(3)}`;
  return digits;
}

function toWhatsAppNumber(value: string): string {
  const localNumber = normalizeSaudiPhone(value);
  return /^05\d{8}$/.test(localNumber) ? `966${localNumber.slice(1)}` : "";
}

router.post("/buyer/item-inquiries/:id/contact/:supplierId", (req, res): void => {
  const buyer = getBuyerSession(req, res);
  if (!buyer || !requireActiveBuyer(buyer, res)) return;
  if (!requireOwner(buyer, res)) return;
  const params = CreateBuyerItemInquiryContactParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "معرّف الاستفسار أو المورد غير صحيح." });
    return;
  }
  const simulated = isTestModeRequest(req, "buyer");
  let contact: { message: string; whatsappNumber: string; simulated: boolean };
  try {
    contact = replyTransaction(() => {
      const now = new Date().toISOString();
      const buyerRow = directoryDb.prepare(`
        SELECT id, full_name AS fullName, phone, city,
          business_type AS businessType, business_name AS businessName,
          other_business_type AS otherBusinessType, is_owner AS isOwner,
          job_title AS jobTitle, moderation_status AS moderationStatus
        FROM buyer_users
        WHERE id = ?
      `).get(buyer.id) as {
        id: number;
        fullName: string;
        phone: string;
        city: string;
        businessType: string;
        businessName: string | null;
        otherBusinessType: string | null;
        isOwner: number;
        jobTitle: string | null;
        moderationStatus: string;
      } | undefined;
      if (!buyerRow || buyerRow.moderationStatus !== "active") {
        throw new Error("BUYER_NOT_ACTIVE");
      }
      if (buyerRow.isOwner !== 1) throw new Error("BUYER_NOT_OWNER");

      const selected = directoryDb.prepare(`
        SELECT inquiry.id, item.name AS itemName,
          inquiry.brand_or_type AS brandOrType, inquiry.city,
          inquiry.allow_alternatives AS allowAlternatives,
          inquiry.package_details AS packageDetails,
          inquiry.expires_at AS expiresAt,
          supplier.id AS supplierId, supplier.city AS supplierCity,
          supplier.phone, supplier.whatsapp,
          reply.response_status AS responseStatus, reply.price,
          reply.package_details AS replyPackageDetails,
          reply.branch_address AS branchAddress, reply.note AS replyNote
        FROM item_availability_inquiries inquiry
        JOIN supplier_taxonomy_items item ON item.id = inquiry.item_id
        JOIN item_availability_recipients recipient
          ON recipient.inquiry_id = inquiry.id AND recipient.supplier_id = ?
        JOIN suppliers supplier
          ON supplier.id = recipient.supplier_id AND supplier.is_active = 1
        JOIN supplier_users supplier_user
          ON supplier_user.supplier_id = supplier.id AND supplier_user.status = 'active'
        JOIN item_availability_replies reply
          ON reply.inquiry_id = inquiry.id AND reply.supplier_id = supplier.id
        WHERE inquiry.id = ? AND inquiry.buyer_id = ?
          AND reply.response_status IN ('available', 'alternative')
          AND ${publicCatalogVisibilitySql("supplier")}
      `).get(
        params.data.supplierId,
        params.data.id,
        buyerRow.id,
      ) as {
        id: number;
        itemName: string;
        brandOrType: string;
        city: string;
        allowAlternatives: number;
        packageDetails: string | null;
        expiresAt: string;
        supplierId: number;
        supplierCity: string;
        phone: string;
        whatsapp: string;
        responseStatus: "available" | "alternative";
        price: number;
        replyPackageDetails: string | null;
        branchAddress: string | null;
        replyNote: string | null;
      } | undefined;
      if (!selected) {
        const owner = directoryDb.prepare(
          "SELECT buyer_id AS buyerId FROM item_availability_inquiries WHERE id = ?",
        ).get(params.data.id) as { buyerId: number } | undefined;
        if (owner && owner.buyerId !== buyerRow.id) throw new Error("INQUIRY_NOT_OWNED");
        throw new Error("NO_ACTIVE_SUPPLIER_OFFER");
      }
      if (selected.expiresAt <= now) throw new Error("OFFER_EXPIRED");
      if (selected.responseStatus === "alternative" && selected.allowAlternatives !== 1) {
        throw new Error("ALTERNATIVE_NOT_ALLOWED");
      }

      const whatsappNumber = toWhatsAppNumber(selected.whatsapp) || toWhatsAppNumber(selected.phone);
      if (!simulated && !whatsappNumber) throw new Error("SUPPLIER_CONTACT_UNAVAILABLE");
      const exactTypeLabel = selected.responseStatus === "alternative" ? "البديل المعروض" : "النوع المطلوب";
      const priceText = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(selected.price);
      const message = [
        "السلام عليكم ورحمة الله وبركاته",
        "",
        "استفسار بخصوص رد التوفر عبر دليل موردي المخابز والحلويات",
        `رقم الاستفسار: ${selected.id}`,
        `صاحب العمل: ${buyerRow.fullName}`,
        `اسم المنشأة: ${buyerRow.businessName || buyerRow.businessType}`,
        `الصفة: ${buyerRow.isOwner === 1 ? "صاحب العمل" : buyerRow.jobTitle || "ممثل المنشأة"}`,
        `رقم التواصل: ${buyerRow.phone}`,
        `مدينة الشراء: ${selected.city}`,
        `الصنف الأساسي: ${selected.itemName}`,
        `النوع المطلوب: ${selected.brandOrType}`,
        `${exactTypeLabel}: ${selected.replyPackageDetails || selected.packageDetails || "يرجى تأكيد العبوة"}`,
        `السعر المعلن: ${priceText} ريال`,
        `نقطة البيع: ${selected.branchAddress || selected.supplierCity}`,
        ...(selected.replyNote ? [`ملاحظة المورد: ${selected.replyNote}`] : []),
        "",
        "أرغب بتأكيد توفر الصنف والسعر قبل التوجه إلى نقطة البيع.",
      ].join("\n");

      if (!simulated) {
        const placeholderId = `TEMP-${randomUUID()}`;
        const inserted = directoryDb.prepare(`
          INSERT INTO contact_logs (buyer_id, supplier_id, message, message_id, sent_at, status)
          VALUES (?, ?, ?, ?, ?, 'sent')
        `).run(buyerRow.id, selected.supplierId, message, placeholderId, now);
        const logId = Number(inserted.lastInsertRowid);
        const messageId = `MSG-${new Date().getFullYear()}-${String(logId).padStart(4, "0")}`;
        directoryDb.prepare("UPDATE contact_logs SET message_id = ? WHERE id = ?")
          .run(messageId, logId);
        directoryDb.prepare(`
          INSERT INTO item_availability_contact_logs
            (contact_log_id, inquiry_id, buyer_id, supplier_id, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(logId, selected.id, buyerRow.id, selected.supplierId, now);
        recordSupplierStat(selected.supplierId, "contact", now);
      }

      return { message, whatsappNumber, simulated };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "BUYER_NOT_ACTIVE") {
      res.status(403).json({ error: "لا يمكن التواصل حتى تصبح حالة حساب صاحب العمل نشطة." });
      return;
    }
    if (error instanceof Error && error.message === "BUYER_NOT_OWNER") {
      res.status(403).json({ error: "التواصل بخصوص استفسار التوفر متاح لصاحب العمل فقط." });
      return;
    }
    if (error instanceof Error && error.message === "INQUIRY_NOT_OWNED") {
      res.status(403).json({ error: "لا تملك صلاحية التواصل بخصوص هذا الاستفسار." });
      return;
    }
    if (error instanceof Error &&
        ["NO_ACTIVE_SUPPLIER_OFFER", "OFFER_EXPIRED", "ALTERNATIVE_NOT_ALLOWED"].includes(error.message)) {
      res.status(404).json({ error: "لم يعد عرض المورد متاحاً لهذا الاستفسار." });
      return;
    }
    if (error instanceof Error && error.message === "SUPPLIER_CONTACT_UNAVAILABLE") {
      res.status(409).json({ error: "لا يتوفر رقم واتساب صالح لنقطة البيع." });
      return;
    }
    res.status(500).json({ error: "تعذر تسجيل التواصل؛ حاول مرة أخرى." });
    return;
  }
  const whatsappUrl = contact.simulated
    ? null
    : `https://wa.me/${contact.whatsappNumber}?text=${encodeURIComponent(contact.message)}`;
  res.json(CreateBuyerItemInquiryContactResponse.parse({
    success: true,
    message: contact.message,
    simulated: contact.simulated,
    whatsappUrl,
  }));
});

export default router;