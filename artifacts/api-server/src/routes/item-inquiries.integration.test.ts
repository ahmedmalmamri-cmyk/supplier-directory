import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const pngPixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0ioAAAAASUVORK5CYII=",
  "base64",
);

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`;
}

function makeCookie(response: Response, cookieName: string): string {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(/,(?=[^;,]+=)/).find((part) =>
    part.trimStart().startsWith(`${cookieName}=`),
  );
  assert.ok(cookie, "login must issue a session cookie");
  return cookie.split(";", 1)[0]!;
}

function assertNoBuyerPrivateFields(value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) assertNoBuyerPrivateFields(entry);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, nested] of Object.entries(value)) {
    assert.ok(
      !["buyerId", "fullName", "phone", "email", "jobTitle"].includes(key),
      "supplier inquiry responses must not expose buyer contact fields",
    );
    assertNoBuyerPrivateFields(nested);
  }
}

test(
  "isolated buyer/supplier availability inquiry flow and private photo access",
  { timeout: 180_000 },
  async (t) => {
    const previousCwd = process.cwd();
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "item-inquiry-e2e-"));
    let server: ReturnType<typeof import("node:http").createServer> | undefined;
    let closeDatabase: (() => void) | undefined;
    let photoPath: string | undefined;
    let photoUploaded = false;
    let photoReadUrl = "";

    // Route authentication in this test uses an ephemeral, test-only signing key.
    process.env.SESSION_SECRET = "isolated-item-inquiry-test-session-secret";

    try {
      // directory-db.ts resolves its file from process.cwd()/data at import time.
      // Import only after switching to this fresh temporary directory.
      process.chdir(tempRoot);
      const { default: app } = await import("../app.ts");
      const { directoryDb } = await import("../lib/directory-db.ts");
      closeDatabase = () => directoryDb.close();

      const activeItem = directoryDb.prepare(`
        WITH RECURSIVE active_nodes(id) AS (
          SELECT id FROM supplier_taxonomy_nodes
          WHERE parent_id IS NULL AND is_active = 1
          UNION ALL
          SELECT child.id FROM supplier_taxonomy_nodes child
          JOIN active_nodes parent ON child.parent_id = parent.id
          WHERE child.is_active = 1
        )
        SELECT item.id, item.name
        FROM supplier_taxonomy_items item
        WHERE item.is_active = 1 AND item.category_id IN (SELECT id FROM active_nodes)
        ORDER BY item.id
        LIMIT 1
      `).get() as { id: number; name: string } | undefined;
      assert.ok(activeItem, "the isolated database must seed an active taxonomy item");

      const citySetting = directoryDb.prepare(
        "SELECT value FROM directory_settings WHERE key = 'available_cities'",
      ).get() as { value: string } | undefined;
      assert.ok(citySetting, "the isolated database must seed supported cities");
      const availableCities: unknown = JSON.parse(citySetting.value);
      assert.ok(
        Array.isArray(availableCities) && availableCities.length > 0 &&
        availableCities.every((city) => typeof city === "string"),
        "the isolated database must have at least one valid configured city",
      );
      const city = availableCities[0] as string;
      const otherCity = (availableCities as string[]).find((entry) => entry !== city);
      const now = new Date().toISOString();
      const password = "isolated-test-password";
      const passwordHash = hashPassword(password);

      const buyerInsert = directoryDb.prepare(`
        INSERT INTO buyer_users
          (full_name, phone, email, city, business_type, business_name, is_owner,
           password_hash, created_at, last_login, moderation_status)
        VALUES (?, ?, ?, ?, 'مخبز', ?, 1, ?, ?, ?, 'active')
      `);
      buyerInsert.run(
        "مستخدم اختبار أول",
        "0500010201",
        "buyer-one@example.invalid",
        city,
        "منشأة اختبار أولى",
        passwordHash,
        now,
        now,
      );
      buyerInsert.run(
        "مستخدم اختبار ثان",
        "0500010202",
        "buyer-two@example.invalid",
        city,
        "منشأة اختبار ثانية",
        passwordHash,
        now,
        now,
      );
      const buyerIds = directoryDb.prepare(
        "SELECT id FROM buyer_users WHERE email LIKE 'buyer-%@example.invalid' ORDER BY id",
      ).all() as Array<{ id: number }>;
      assert.equal(buyerIds.length, 2, "two isolated buyer accounts must be seeded");

      const supplierInsert = directoryDb.prepare(`
        INSERT INTO suppliers
          (name, city, region, description, phone, whatsapp, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
      `);
      supplierInsert.run(
        "مورد اختبار أول",
        city,
        "منطقة الاختبار",
        "حساب مورد اختبار",
        "0500020201",
        "0500020201",
        now,
      );
      supplierInsert.run(
        "مورد اختبار ثان",
        city,
        "منطقة الاختبار",
        "حساب مورد اختبار غير مطابق",
        "0500020202",
        "0500020202",
        now,
      );
      const supplierIds = directoryDb.prepare(
        "SELECT id FROM suppliers WHERE phone IN ('0500020201', '0500020202') ORDER BY id",
      ).all() as Array<{ id: number }>;
      assert.equal(supplierIds.length, 2, "two isolated active suppliers must be seeded");

      const supplierUserInsert = directoryDb.prepare(`
        INSERT INTO supplier_users (supplier_id, phone, password_hash, status, created_at)
        VALUES (?, ?, ?, 'active', ?)
      `);
      supplierUserInsert.run(supplierIds[0]!.id, "0500020201", passwordHash, now);
      supplierUserInsert.run(supplierIds[1]!.id, "0500020202", passwordHash, now);

      // Exactly one supplier is mapped to this real active taxonomy item.
      directoryDb.prepare(`
        INSERT INTO supplier_taxonomy_item_suppliers (supplier_id, item_id, created_at)
        VALUES (?, ?, ?)
      `).run(supplierIds[0]!.id, activeItem.id, now);
      assert.equal(
        directoryDb.prepare(
          "SELECT count(*) AS count FROM supplier_taxonomy_item_suppliers WHERE item_id = ?",
        ).get(activeItem.id)?.count,
        1,
      );

      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve, reject) => {
        server!.once("listening", resolve);
        server!.once("error", reject);
      });
      const address = server.address();
      assert.ok(address && typeof address === "object", "isolated API server must listen");
      const api = `http://127.0.0.1:${address.port}/api`;

      const request = (
        route: string,
        options: { method?: string; cookie?: string; body?: unknown } = {},
      ) => {
        const headers = new Headers();
        if (options.cookie) headers.set("cookie", options.cookie);
        if (options.body !== undefined) headers.set("content-type", "application/json");
        return fetch(`${api}${route}`, {
          method: options.method ?? "GET",
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });
      };
      const login = async (role: "buyer" | "supplier", phone: string, cookieName: string) => {
        const response = await fetch(`${api}/${role}/login`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...(role === "buyer" ? { identifier: phone } : { phone }),
            password,
          }),
        });
        assert.equal(response.status, 200, `${role} login must succeed`);
        return makeCookie(response, cookieName);
      };
      const buyerOne = await login("buyer", "0500010201", "bakery_buyer_session");
      const buyerTwo = await login("buyer", "0500010202", "bakery_buyer_session");
      const supplierOne = await login("supplier", "0500020201", "bakery_supplier_session");
      const supplierTwo = await login("supplier", "0500020202", "bakery_supplier_session");

      const matches = await request(
        `/buyer/item-inquiries/matches?itemId=${activeItem.id}&city=${encodeURIComponent(city)}`,
        { cookie: buyerOne },
      );
      assert.equal(matches.status, 200, "same-city match lookup must succeed");
      assert.equal((await matches.json() as { count: number }).count, 1);
      if (otherCity) {
        const noMatches = await request(
          `/buyer/item-inquiries/matches?itemId=${activeItem.id}&city=${encodeURIComponent(otherCity)}`,
          { cookie: buyerOne },
        );
        assert.equal(noMatches.status, 200);
        assert.equal((await noMatches.json() as { count: number }).count, 0);
      }

      const createInquiry = async (brandOrType: string, allowAlternatives: boolean) => {
        const response = await request("/buyer/item-inquiries", {
          method: "POST",
          cookie: buyerOne,
          body: {
            itemId: activeItem.id,
            brandOrType,
            city,
            allowAlternatives,
          },
        });
        assert.equal(response.status, 201, "buyer inquiry without quantity must be accepted");
        const inquiry = await response.json() as {
          id: number;
          quantity: number | null;
          replies: unknown[];
        };
        assert.equal(inquiry.quantity, null, "quantity must remain optional");
        assert.deepEqual(inquiry.replies, []);
        return inquiry;
      };

      const availableInquiry = await createInquiry("نوع محدد متوفر", false);
      const alternativeInquiry = await createInquiry("نوع محدد يسمح بالبديل", true);
      const unavailableInquiry = await createInquiry("نوع محدد غير متوفر", false);

      const supplierInbox = await request("/supplier/item-inquiries", { cookie: supplierOne });
      assert.equal(supplierInbox.status, 200);
      const inboxRows = await supplierInbox.json() as Array<Record<string, unknown>>;
      assert.equal(inboxRows.length, 3, "only the linked supplier should receive these inquiries");
      assertNoBuyerPrivateFields(inboxRows);
      assert.ok(
        !JSON.stringify(inboxRows).includes("0500010201") &&
        !JSON.stringify(inboxRows).includes("buyer-one@example.invalid"),
        "supplier inbox must not contain buyer phone or email values",
      );

      const otherSupplierInbox = await request("/supplier/item-inquiries", { cookie: supplierTwo });
      assert.equal(otherSupplierInbox.status, 200);
      assert.deepEqual(await otherSupplierInbox.json(), []);

      const validAvailableReply = {
        responseStatus: "available",
        price: 42.5,
        packageDetails: "عبوة اختبار 1 كجم",
        branchAddress: "فرع الاختبار",
      };
      const missingPrice = await request(
        `/supplier/item-inquiries/${availableInquiry.id}/reply`,
        { method: "PUT", cookie: supplierOne, body: { responseStatus: "available", branchAddress: "فرع الاختبار" } },
      );
      assert.equal(missingPrice.status, 400, "available response must require price");
      const missingBranch = await request(
        `/supplier/item-inquiries/${availableInquiry.id}/reply`,
        { method: "PUT", cookie: supplierOne, body: { responseStatus: "available", price: 42.5 } },
      );
      assert.equal(missingBranch.status, 400, "available response must require branch address");
      const invalidAlternative = await request(
        `/supplier/item-inquiries/${availableInquiry.id}/reply`,
        {
          method: "PUT",
          cookie: supplierOne,
          body: { responseStatus: "alternative", price: 39, branchAddress: "فرع الاختبار" },
        },
      );
      assert.equal(invalidAlternative.status, 400, "alternative must be rejected when not allowed");

      const wrongSupplierReply = await request(
        `/supplier/item-inquiries/${availableInquiry.id}/reply`,
        { method: "PUT", cookie: supplierTwo, body: validAvailableReply },
      );
      assert.equal(wrongSupplierReply.status, 403, "unmatched supplier must not respond");

      const availableResponse = await request(
        `/supplier/item-inquiries/${availableInquiry.id}/reply`,
        { method: "PUT", cookie: supplierOne, body: validAvailableReply },
      );
      assert.equal(availableResponse.status, 200);
      assert.equal((await availableResponse.json() as { responseStatus: string }).responseStatus, "available");

      const alternativeResponse = await request(
        `/supplier/item-inquiries/${alternativeInquiry.id}/reply`,
        {
          method: "PUT",
          cookie: supplierOne,
          body: { responseStatus: "alternative", price: 39, packageDetails: "عبوة بديلة", branchAddress: "فرع الاختبار" },
        },
      );
      assert.equal(alternativeResponse.status, 200);
      assert.equal((await alternativeResponse.json() as { responseStatus: string }).responseStatus, "alternative");

      const unavailableResponse = await request(
        `/supplier/item-inquiries/${unavailableInquiry.id}/reply`,
        { method: "PUT", cookie: supplierOne, body: { responseStatus: "unavailable" } },
      );
      assert.equal(unavailableResponse.status, 200);
      assert.equal((await unavailableResponse.json() as { responseStatus: string }).responseStatus, "unavailable");

      const buyerInquiries = await request("/buyer/item-inquiries", { cookie: buyerOne });
      assert.equal(buyerInquiries.status, 200);
      const buyerRows = await buyerInquiries.json() as Array<{
        id: number;
        replies: Array<{ responseStatus: string; price: number | null }>;
      }>;
      assert.equal(buyerRows.length, 3);
      const repliedStatuses = new Map(
        buyerRows.map((inquiry) => [inquiry.id, inquiry.replies[0]?.responseStatus]),
      );
      assert.equal(repliedStatuses.get(availableInquiry.id), "available");
      assert.equal(repliedStatuses.get(alternativeInquiry.id), "alternative");
      assert.equal(repliedStatuses.get(unavailableInquiry.id), "unavailable");
      assert.equal(
        buyerRows.find((inquiry) => inquiry.id === unavailableInquiry.id)?.replies[0]?.price,
        null,
      );

      const otherBuyerList = await request("/buyer/item-inquiries", { cookie: buyerTwo });
      assert.equal(otherBuyerList.status, 200);
      assert.deepEqual(await otherBuyerList.json(), []);
      const otherBuyerContact = await request(
        `/buyer/item-inquiries/${availableInquiry.id}/contact/${supplierIds[0]!.id}`,
        { method: "POST", cookie: buyerTwo },
      );
      assert.equal(otherBuyerContact.status, 403, "another buyer must not contact through this inquiry");

      const contact = await request(
        `/buyer/item-inquiries/${availableInquiry.id}/contact/${supplierIds[0]!.id}`,
        { method: "POST", cookie: buyerOne },
      );
      assert.equal(contact.status, 200, "buyer may contact the supplier after an available reply");
      const contactData = await contact.json() as {
        whatsappUrl: string | null;
        simulated: boolean;
        message: string;
      };
      assert.equal(contactData.simulated, false);
      assert.ok(contactData.whatsappUrl, "contact endpoint must return WhatsApp only after logging");
      assert.ok(contactData.message.includes("مستخدم اختبار أول"));
      const contactCounts = directoryDb.prepare(`
        SELECT
          (SELECT count(*) FROM contact_logs WHERE buyer_id = ?) AS contacts,
          (SELECT count(*) FROM item_availability_contact_logs WHERE inquiry_id = ? AND buyer_id = ?) AS linked
      `).get(buyerIds[0]!.id, availableInquiry.id, buyerIds[0]!.id) as {
        contacts: number;
        linked: number;
      };
      assert.equal(contactCounts.contacts, 1);
      assert.equal(contactCounts.linked, 1, "contact log must be associated with its inquiry");

      const closeResponse = await request(
        `/buyer/item-inquiries/${unavailableInquiry.id}/close`,
        { method: "PATCH", cookie: buyerOne },
      );
      assert.equal(closeResponse.status, 200);
      const replyAfterClose = await request(
        `/supplier/item-inquiries/${unavailableInquiry.id}/reply`,
        { method: "PUT", cookie: supplierOne, body: { responseStatus: "unavailable" } },
      );
      assert.equal(replyAfterClose.status, 404, "closed inquiry must no longer accept replies");

      const photoUpload = await request("/buyer/item-inquiries/photo-upload-url", {
        method: "POST",
        cookie: buyerOne,
        body: { name: "reference.png", size: pngPixel.length, contentType: "image/png" },
      });
      assert.equal(photoUpload.status, 200, "private image upload URL must be issued");
      const upload = await photoUpload.json() as { uploadUrl: string; objectPath: string };
      photoPath = upload.objectPath;
      const putPhoto = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: pngPixel,
      });
      assert.equal(putPhoto.status, 200, "signed private image upload must accept the PNG bytes");
      photoUploaded = true;

      const photoInquiryResponse = await request("/buyer/item-inquiries", {
        method: "POST",
        cookie: buyerOne,
        body: {
          itemId: activeItem.id,
          brandOrType: "نوع محدد مع صورة",
          city,
          allowAlternatives: false,
          photoPath,
        },
      });
      assert.equal(photoInquiryResponse.status, 201, "uploaded image must attach to its owner's inquiry");
      const photoInquiry = await photoInquiryResponse.json() as { id: number; photoUrl: string | null };
      assert.ok(photoInquiry.photoUrl);
      photoReadUrl = `${api}/item-inquiries/${photoInquiry.id}/photo`;

      const ownerPhoto = await fetch(photoReadUrl, { headers: { cookie: buyerOne } });
      assert.equal(ownerPhoto.status, 200, "photo owner may view the attached private image");
      assert.equal(ownerPhoto.headers.get("content-type"), "image/png");
      assert.deepEqual(Buffer.from(await ownerPhoto.arrayBuffer()), pngPixel);

      const allowedSupplierPhoto = await fetch(photoReadUrl, { headers: { cookie: supplierOne } });
      assert.equal(allowedSupplierPhoto.status, 200, "targeted supplier may view the product reference");
      assert.equal((await allowedSupplierPhoto.arrayBuffer()).byteLength, pngPixel.byteLength);

      const otherBuyerPhoto = await fetch(photoReadUrl, { headers: { cookie: buyerTwo } });
      assert.equal(otherBuyerPhoto.status, 403, "other buyer may not view the private image");
      const otherSupplierPhoto = await fetch(photoReadUrl, { headers: { cookie: supplierTwo } });
      assert.equal(otherSupplierPhoto.status, 403, "unmatched supplier may not view the private image");
    } finally {
      if (server) {
        await new Promise<void>((resolve) => server!.close(() => resolve()));
      }
      if (closeDatabase) closeDatabase();
      process.chdir(previousCwd);

      if (photoPath && photoUploaded) {
        try {
          const { Storage } = await import("@google-cloud/storage");
          const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID?.trim();
          const privateObjectDir = process.env.PRIVATE_OBJECT_DIR?.trim();
          const photoName = /^\/objects\/item-inquiry-photos\/([0-9a-f-]+)$/.exec(photoPath)?.[1];
          if (bucketId && privateObjectDir && photoName) {
            const prefix = privateObjectDir.split("/").filter(Boolean).slice(1).join("/");
            const objectName = [prefix, "item-inquiry-photos", photoName].filter(Boolean).join("/");
            const storage = new Storage({
              credentials: {
                audience: "replit",
                subject_token_type: "access_token",
                token_url: "http://127.0.0.1:1106/token",
                type: "external_account",
                credential_source: {
                  url: "http://127.0.0.1:1106/credential",
                  format: { type: "json", subject_token_field_name: "access_token" },
                },
                universe_domain: "googleapis.com",
              },
              projectId: "",
            });
            await storage.bucket(bucketId).file(objectName).delete({ ignoreNotFound: true });
          }
        } catch {
          t.diagnostic("Temporary private photo cleanup could not be confirmed.");
        }
      }

      await rm(tempRoot, { recursive: true, force: true });
    }
  },
);