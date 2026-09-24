import { Router, type IRouter } from "express";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { CompleteSupplierInviteBody } from "@workspace/api-zod";
import { directoryDb } from "../lib/directory-db";

const router: IRouter = Router();
const uploadsDir = path.resolve(process.cwd(), "uploads");
mkdirSync(uploadsDir, { recursive: true });

const eastCities = ["الدمام", "الخبر", "الظهران", "الأحساء", "الجبيل", "القطيف", "حفر الباطن", "رأس تنورة"];
const supplierBusinessTypes = ["منتج / مصنع", "موزع", "مستورد", "تاجر جملة", "أخرى"];
const buyerBusinessTypes = ["مخبز", "محل حلويات", "كافيه", "مطعم", "فندق", "آخر"];
const categoryNames = [
  "دقيق", "سميد وبرغل", "سكر", "زبدة ودهون", "مارجرين", "سمن",
  "حليب ومشتقاته", "أجبان", "زبادي وقشطة", "كريمة",
  "شوكولاتة وكاكاو", "حلوى وسكاكر", "جيلاتين وكاسترد", "خلطات جاهزة",
  "مكسرات", "فواكه مجففة", "عسل ومحليات", "دبس",
  "خمائر ومحسنات", "نكهات وألوان", "فانيليا ومستخلصات",
  "عجين سمبوسة", "عجين بيتزا", "خبز رقاق", "خبز جاهز", "معجنات مجمدة",
  "علب وتغليف", "أكياس مطبوعة", "كراتين مطبوعة", "أدوات تزيين",
  "معدات وأفران", "أدوات صغيرة",
  "خليط الكيك", "خليط الكيك - فانيليا", "خليط الكيك - شوكولاتة", "خليط ريد فيلفت",
  "خليط الكيك - ليمون", "خليط الكيك - برتقال",
  "خليط الكب كيك", "خليط الكب كيك - شوكولاتة", "خليط الكب كيك - فانيليا",
  "خليط البراوني", "خليط المافن", "خليط المافن - شوكولاتة", "خليط المافن - فانيليا",
  "خليط البان كيك", "خليط الوافل", "خليط البسكويت", "خليط الكرواسون",
  "دقيق وخبز", "سكر ومحليات", "زبدة", "دهون وزبدة", "شوكولاتة", "كاكاو",
  "عبوات وتغليف", "معدات وأدوات", "أخرى",
];

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

function prepareInvitationImages(values: unknown) {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.length > 3) throw new Error("يمكن إرفاق ثلاث صور كحد أقصى.");
  const files = values.map((value) => {
    if (typeof value !== "string") throw new Error("صيغة الصورة غير مدعومة.");
    const match = value.trim().match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/);
    if (!match) throw new Error("استخدم صور JPG أو PNG أو WebP فقط.");
    const data = Buffer.from(match[2].replace(/\s/g, ""), "base64");
    if (!data.length || data.length > 5 * 1024 * 1024) throw new Error("يجب ألا يتجاوز حجم كل صورة 5 ميجابايت.");
    const extension = match[1] === "image/jpeg" ? "jpg" : match[1].split("/")[1];
    const filename = `invitation-product-${randomUUID()}.${extension}`;
    return { filename, data, url: `/uploads/${filename}` };
  });
  if (files.reduce((total, file) => total + file.data.length, 0) > 10 * 1024 * 1024) {
    throw new Error("إجمالي أحجام الصور يتجاوز 10 ميجابايت.");
  }
  for (const file of files) writeFileSync(path.join(uploadsDir, file.filename), file.data);
  return files.map((file) => file.url);
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

const inviteReadyMixSubtypes = [
  "خليط الكيك - فانيليا", "خليط الكيك - شوكولاتة", "خليط ريد فيلفيت",
  "خليط الكيك - ليمون", "خليط الكيك - برتقال", "خليط الكب كيك",
  "خليط الكب كيك - شوكولاتة", "خليط الكب كيك - فانيليا", "خليط البراوني",
  "خليط المافن", "خليط المافن - شوكولاتة", "خليط المافن - فانيليا",
  "خليط البان كيك", "خليط الوافل", "خليط البسكويت", "خليط الكرواسون",
];

function invitationTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function findSupplierInvite(tokenValue: unknown) {
  const token = text(tokenValue);
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return undefined;
  return directoryDb.prepare(`
    SELECT id, name, city, whatsapp, invite_token AS inviteToken,
      invite_sent_at AS inviteSentAt, invite_completed_at AS inviteCompletedAt
    FROM suppliers WHERE invite_token = ?
  `).get(invitationTokenHash(token)) as {
    id: number;
    name: string;
    city: string;
    whatsapp: string;
    inviteToken: string;
    inviteSentAt: string | null;
    inviteCompletedAt: string | null;
  } | undefined;
}

router.get("/invites/:token", (req, res): void => {
  const supplier = findSupplierInvite(req.params.token);
  if (!supplier) {
    res.status(404).json({ error: "رابط الدعوة غير صالح أو انتهت صلاحيته." });
    return;
  }
  const citiesRow = directoryDb.prepare(
    "SELECT value FROM directory_settings WHERE key = 'available_cities'",
  ).get() as { value: string } | undefined;
  const categories = directoryDb.prepare(`
    SELECT id, name, icon, group_name AS groupName,
      display_on_home AS displayOnHome, display_order AS displayOrder, is_active AS isActive
    FROM item_categories WHERE is_active = 1 AND display_on_home = 1
    ORDER BY display_order, id
  `).all().map((row) => ({
    ...row as object,
    displayOnHome: Boolean((row as { displayOnHome: number }).displayOnHome),
    isActive: Boolean((row as { isActive: number }).isActive),
  }));
  let cities: string[] = [];
  try {
    cities = JSON.parse(citiesRow?.value ?? "[]") as string[];
  } catch {
    cities = [];
  }
  res.json({
    supplierName: supplier.name,
    initialCity: supplier.city,
    initialWhatsapp: supplier.whatsapp,
    alreadyCompleted: Boolean(supplier.inviteCompletedAt),
    cities,
    categories,
    readyMixSubtypes: inviteReadyMixSubtypes,
  });
});

router.post("/invites/:token/open", (req, res): void => {
  const supplier = findSupplierInvite(req.params.token);
  if (!supplier) {
    res.status(404).json({ error: "رابط الدعوة غير صالح أو انتهت صلاحيته." });
    return;
  }
  if (supplier.inviteCompletedAt) {
    res.status(409).json({ error: "تم استكمال هذه الدعوة وإرسالها للمراجعة." });
    return;
  }
  directoryDb.prepare(`
    UPDATE suppliers SET invite_opened_at = COALESCE(invite_opened_at, ?) WHERE id = ?
  `).run(new Date().toISOString(), supplier.id);
  res.json({ success: true, message: "تم تسجيل فتح رابط الدعوة." });
});

router.post("/invites/:token/complete", (req, res): void => {
  const supplier = findSupplierInvite(req.params.token);
  if (!supplier) {
    res.status(404).json({ error: "رابط الدعوة غير صالح أو انتهت صلاحيته." });
    return;
  }
  if (supplier.inviteCompletedAt) {
    res.status(409).json({ error: "تم استكمال هذه الدعوة وإرسالها للمراجعة." });
    return;
  }
  const parsed = CompleteSupplierInviteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "يرجى استكمال اسم النشاط والمدينة وواتساب واختيار فئة واحدة على الأقل." });
    return;
  }
  const businessName = parsed.data.businessName.trim();
  const city = parsed.data.city.trim();
  const whatsapp = normalizeSaudiPhone(parsed.data.whatsapp);
  const categoryRows = directoryDb.prepare(`
    SELECT name FROM item_categories WHERE is_active = 1 AND display_on_home = 1
  `).all() as Array<{ name: string }>;
  const allowedCategories = new Set([...categoryRows.map((row) => row.name), ...inviteReadyMixSubtypes]);
  const categories = [...new Set(parsed.data.categories.map((category) => category.trim()))];
  const citiesRow = directoryDb.prepare(
    "SELECT value FROM directory_settings WHERE key = 'available_cities'",
  ).get() as { value: string } | undefined;
  let allowedCities: string[] = [];
  try {
    allowedCities = JSON.parse(citiesRow?.value ?? "[]") as string[];
  } catch {
    allowedCities = [];
  }
  const otherCategory = parsed.data.otherCategory?.trim();
  if (businessName.length < 2 || !/^05\d{8}$/.test(whatsapp) ||
      !allowedCities.includes(city) || categories.length === 0 ||
      categories.some((category) => !allowedCategories.has(category)) ||
      (otherCategory !== undefined && otherCategory.length > 100)) {
    res.status(400).json({ error: "تحقق من بيانات النشاط والمدينة والفئات المختارة." });
    return;
  }
  const savedCategories = otherCategory
    ? [...categories, `أخرى: ${otherCategory}`]
    : categories;
  const description = parsed.data.description?.trim()
    || `مورد متخصص في توفير ${savedCategories.join("، ")}.`;
  let productImages: string[];
  try {
    productImages = prepareInvitationImages(parsed.data.images);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "تعذر حفظ الصور." });
    return;
  }
  const now = new Date().toISOString();
  directoryDb.exec("BEGIN");
  try {
    const result = directoryDb.prepare(`
      INSERT INTO supplier_requests
        (request_code, business_name, contact_person, business_type, phone, whatsapp,
         email, website, city, address, delivers_to_other_cities, other_cities,
         categories, min_order, description, commercial_license_url, id_card_url,
         health_certificate_url, accepted_terms, accepted_data, accepted_business,
         accepted_publish, status, created_at, invited_supplier_id, product_images)
      VALUES (?, ?, ?, 'أخرى', ?, ?, NULL, NULL, ?, NULL, 0, NULL, ?, NULL, ?,
        NULL, NULL, NULL, 0, 0, 0, 0, 'pending_review', ?, ?, ?)
    `).run(
      `TEMP-${randomUUID()}`, businessName, businessName, whatsapp, whatsapp, city,
      JSON.stringify(savedCategories), description, now, supplier.id, JSON.stringify(productImages),
    );
    const requestId = Number(result.lastInsertRowid);
    const requestCode = nextRequestCode("supplier_requests", requestId);
    directoryDb.prepare("UPDATE supplier_requests SET request_code = ? WHERE id = ?").run(requestCode, requestId);
    const completed = directoryDb.prepare(`
      UPDATE suppliers SET invite_completed_at = ?
      WHERE id = ? AND invite_token = ? AND invite_completed_at IS NULL
    `).run(now, supplier.id, supplier.inviteToken);
    if (!completed.changes) throw new Error("تم استكمال هذه الدعوة مسبقاً.");
    directoryDb.exec("COMMIT");
    res.status(201).json({
      success: true,
      status: "pending_review",
      requestCode,
      message: "وصلت بياناتك، وستظهر في الدليل بعد مراجعة الإدارة واعتمادها.",
    });
  } catch (error) {
    directoryDb.exec("ROLLBACK");
    res.status(error instanceof Error && error.message.includes("مسبقاً") ? 409 : 400)
      .json({ error: error instanceof Error ? error.message : "تعذر إرسال البيانات للمراجعة." });
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