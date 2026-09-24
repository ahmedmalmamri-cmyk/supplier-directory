import { Router, type IRouter } from "express";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { directoryDb } from "../lib/directory-db";

const router: IRouter = Router();
const uploadsDir = path.resolve(process.cwd(), "uploads");
mkdirSync(uploadsDir, { recursive: true });

const eastCities = ["الدمام", "الخبر", "الظهران", "الأحساء", "الجبيل", "القطيف", "حفر الباطن", "رأس تنورة"];
const supplierBusinessTypes = ["منتج / مصنع", "موزع", "مستورد", "تاجر جملة", "أخرى"];
const buyerBusinessTypes = ["مخبز", "محل حلويات", "كافيه", "مطعم", "فندق", "آخر"];
const categoryNames = ["دقيق وخبز", "سكر ومحليات", "زبدة", "زبدة ودهون", "دهون وزبدة", "حليب ومشتقاته", "أجبان", "شوكولاتة وكاكاو", "مكسرات", "نكهات وألوان", "خمائر ومحسنات", "عبوات وتغليف", "معدات وأدوات", "أخرى"];

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

function phoneIsValid(value: string) {
  return /^05\d{8}$/.test(normalizeSaudiPhone(value));
}

function wordCount(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function saveDataUrl(value: unknown, prefix: string) {
  const dataUrl = text(value);
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw new Error("صيغة الملف غير مدعومة");
  const mime = match[1];
  const data = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (data.length > 5 * 1024 * 1024) throw new Error("حجم الملف يتجاوز 5 ميجابايت");
  const extension = mime === "application/pdf" ? "pdf" : mime.split("/")[1].replace("jpeg", "jpg");
  const filename = `${prefix}-${randomUUID()}.${extension}`;
  writeFileSync(path.join(uploadsDir, filename), data);
  return `/uploads/${filename}`;
}

function nextRequestCode(table: string, id: number) {
  const year = new Date().getFullYear();
  return `REQ-${year}-${String(id).padStart(3, "0")}`;
}

router.post("/supplier-requests", (req, res): void => {
  const body = req.body as Record<string, unknown>;
  const businessName = text(body.businessName);
  const contactPerson = text(body.contactPerson);
  const businessType = text(body.businessType);
  const phone = normalizeSaudiPhone(text(body.phone));
  const whatsapp = normalizeSaudiPhone(text(body.whatsapp));
  const email = text(body.email);
  const website = text(body.website);
  const city = text(body.city);
  const address = text(body.address);
  const otherCities = text(body.otherCities);
  const categories = Array.isArray(body.categories) ? body.categories.filter((item): item is string => typeof item === "string") : [];
  const minOrder = text(body.minOrder);
  const submittedDescription = text(body.description);
  const description = submittedDescription || `مورد متخصص في توفير ${categories.join("، ")}.`;
  const deliversToOtherCities = body.deliversToOtherCities === true;
  const acceptedTerms = body.acceptedTerms === true;
  const acceptedData = body.acceptedData === true;
  const acceptedBusiness = body.acceptedBusiness === true;
  const acceptedPublish = body.acceptedPublish === true;

  if (!businessName || !contactPerson || !supplierBusinessTypes.includes(businessType) ||
      !phoneIsValid(phone) || !phoneIsValid(whatsapp) || !eastCities.includes(city) ||
      categories.length === 0 || categories.some((item) => !categoryNames.includes(item)) ||
       wordCount(description) > 300 ||
      !acceptedTerms || !acceptedData || !acceptedBusiness || !acceptedPublish ||
      (deliversToOtherCities && !otherCities)) {
    res.status(400).json({ error: "يرجى استكمال بيانات المورد والتأكد من صحة الجوال والإقرارات." });
    return;
  }

  try {
    const commercialLicenseUrl = saveDataUrl(body.commercialLicense, "commercial-license");
    const idCardUrl = saveDataUrl(body.idCard, "id-card");
    const healthCertificateUrl = saveDataUrl(body.healthCertificate, "health-certificate");
    const now = new Date().toISOString();
    const result = directoryDb.prepare(`
      INSERT INTO supplier_requests
        (request_code, business_name, contact_person, business_type, phone, whatsapp, email, website,
         city, address, delivers_to_other_cities, other_cities, categories, min_order, description,
         commercial_license_url, id_card_url, health_certificate_url, accepted_terms, accepted_data, accepted_business,
         accepted_publish, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      `TEMP-${randomUUID()}`, businessName, contactPerson, businessType, phone, whatsapp, email || null, website || null,
      city, address || null, deliversToOtherCities ? 1 : 0, otherCities || null, JSON.stringify(categories),
      minOrder || null, description, commercialLicenseUrl, idCardUrl, healthCertificateUrl,
      1, 1, 1, 1, now,
    );
    const id = Number(result.lastInsertRowid);
    const requestCode = nextRequestCode("supplier_requests", id);
    directoryDb.prepare("UPDATE supplier_requests SET request_code = ? WHERE id = ?").run(requestCode, id);
    res.status(201).json({ success: true, requestId: id, requestCode, message: "تم استلام طلب المورد وسيتم مراجعته يدوياً." });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "تعذر حفظ طلب المورد" });
  }
});

router.post("/buyer-requests", (req, res): void => {
  const body = req.body as Record<string, unknown>;
  const fullName = text(body.fullName);
  const phone = normalizeSaudiPhone(text(body.phone));
  const email = text(body.email);
  const city = text(body.city);
  const businessType = text(body.businessType);
  const newsletterWeekly = body.newsletterWeekly === true;
  const buyersGroup = body.buyersGroup === true;
  if (!fullName || !phoneIsValid(phone) || !city || !buyerBusinessTypes.includes(businessType)) {
    res.status(400).json({ error: "يرجى استكمال الاسم والجوال والمدينة ونوع النشاط." });
    return;
  }
  const now = new Date().toISOString();
  const result = directoryDb.prepare(`
    INSERT INTO buyer_requests
      (request_code, full_name, phone, email, city, business_type, business_name, referral_source,
       newsletter_weekly, buyers_group, created_at)
    VALUES ('PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fullName,
    phone,
    email || null,
    city,
    businessType,
    text(body.businessName) || null,
    text(body.referralSource) || null,
    newsletterWeekly ? 1 : 0,
    buyersGroup ? 1 : 0,
    now,
  );
  const id = Number(result.lastInsertRowid);
  const requestCode = nextRequestCode("buyer_requests", id);
  directoryDb.prepare("UPDATE buyer_requests SET request_code = ? WHERE id = ?").run(requestCode, id);
   res.status(201).json({ success: true, requestId: id, requestCode, message: "تم تسجيل بيانات صاحب العمل بنجاح." });
});

export default router;