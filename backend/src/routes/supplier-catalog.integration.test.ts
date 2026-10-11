import assert from "node:assert/strict";
import { createHmac, randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`;
}

function getCookie(response: Response, name: string) {
  const header = response.headers.get("set-cookie") ?? "";
  const cookie = header.split(/,(?=[^;,]+=)/).find((part) => part.trimStart().startsWith(`${name}=`));
  assert.ok(cookie, `${name} must be set`);
  return cookie.split(";", 1)[0]!;
}

test("supplier catalog pending, approved, removed visibility and admin stats", { timeout: 120_000 }, async () => {
  const previousCwd = process.cwd();
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSessionSecret = process.env.SESSION_SECRET;
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "supplier-catalog-integration-"));
  const secret = "isolated-supplier-catalog-test-session-secret";
  process.env.SESSION_SECRET = secret;
  process.env.NODE_ENV = "test";
  let server: ReturnType<typeof import("node:http").createServer> | undefined;
  let closeDatabase: (() => void) | undefined;
  try {
    process.chdir(tempRoot);
    const { default: app } = await import("../app.ts");
    const { directoryDb } = await import("../lib/directory-db.ts");
    closeDatabase = () => directoryDb.close();

    const item = directoryDb.prepare(`
      SELECT i.id, i.name, i.category_id AS categoryId
      FROM supplier_taxonomy_items i
      JOIN supplier_taxonomy_nodes n ON n.id = i.category_id AND n.is_active = 1
      LEFT JOIN supplier_taxonomy_nodes parent ON parent.id = n.parent_id
      WHERE i.is_active = 1 AND i.name_en IS NULL
        AND lower(trim(n.name)) NOT IN ('الخدمات والاستشارات', 'خدمات واستشارات')
        AND lower(trim(COALESCE(parent.name, ''))) NOT IN ('الخدمات والاستشارات', 'خدمات واستشارات')
      ORDER BY i.id LIMIT 1
    `).get() as { id: number; name: string; categoryId: number } | undefined;
    assert.ok(item, "fixture needs a publicly visible untranslated active taxonomy item");

    const now = new Date().toISOString();
    const almondNames = ["لوز حب", "لوز شرائح", "لوز مطحون"];
    const almondSeed = directoryDb.prepare(`
      SELECT id, category_id AS categoryId
      FROM supplier_taxonomy_items
      WHERE name IN (${almondNames.map(() => "?").join(", ")})
      ORDER BY id LIMIT 1
    `).get(...almondNames) as { id: number; categoryId: number } | undefined;
    const almondCategoryId = almondSeed?.categoryId ?? item.categoryId;
    for (const name of almondNames) {
      let almond = directoryDb.prepare("SELECT id FROM supplier_taxonomy_items WHERE name = ?")
        .get(name) as { id: number } | undefined;
      if (!almond) {
        const insert = directoryDb.prepare(`
          INSERT INTO supplier_taxonomy_items (name, category_id, is_active, created_at, updated_at)
          VALUES (?, ?, 1, ?, ?)
        `).run(name, almondCategoryId, now, now);
        almond = { id: Number(insert.lastInsertRowid) };
      }
      directoryDb.prepare(`
        INSERT OR IGNORE INTO items_categories (item_id, category_id, is_primary, created_at)
        VALUES (?, ?, 1, ?)
      `).run(almond.id, almondCategoryId, now);
    }
    let hazelnutFixture = directoryDb.prepare("SELECT id FROM supplier_taxonomy_items WHERE name = ?")
      .get("بندق") as { id: number } | undefined;
    if (!hazelnutFixture) {
      const insert = directoryDb.prepare(`
        INSERT INTO supplier_taxonomy_items (name, category_id, is_active, created_at, updated_at)
        VALUES ('بندق', ?, 1, ?, ?)
      `).run(almondCategoryId, now, now);
      hazelnutFixture = { id: Number(insert.lastInsertRowid) };
    }
    for (const name of ["جوز", "فستق"]) {
      if (!directoryDb.prepare("SELECT id FROM supplier_taxonomy_items WHERE name = ?").get(name)) {
        directoryDb.prepare(`
          INSERT INTO supplier_taxonomy_items (name, category_id, is_active, created_at, updated_at)
          VALUES (?, ?, 1, ?, ?)
        `).run(name, almondCategoryId, now, now);
      }
    }
    const insertFixtureForm = directoryDb.prepare(`
      INSERT OR IGNORE INTO supplier_catalog_item_forms (item_id, name_ar, name_en, created_at)
      VALUES (?, ?, ?, ?)
    `);
    for (const [nameAr, nameEn] of [
      ["صحيح", "Whole"],
      ["مطحون", "Ground"],
      ["مجروش", "Crushed"],
    ]) insertFixtureForm.run(hazelnutFixture.id, nameAr, nameEn, now);
    const insertFixtureAttribute = directoryDb.prepare(`
      INSERT OR IGNORE INTO supplier_catalog_item_attributes (item_id, name_ar, name_en, created_at)
      VALUES (?, ?, ?, ?)
    `);
    const insertFixtureOption = directoryDb.prepare(`
      INSERT OR IGNORE INTO supplier_catalog_item_attribute_options (attribute_id, name_ar, name_en, created_at)
      VALUES (?, ?, ?, ?)
    `);
    for (const [nameAr, nameEn, options] of [
      ["اللون", "Color", [["أبيض", "White"], ["أحمر", "Red"]]],
      ["التحميص", "Roasting", [["ني", "Raw"], ["محمص", "Roasted"]]],
    ] as const) {
      insertFixtureAttribute.run(hazelnutFixture.id, nameAr, nameEn, now);
      const attribute = directoryDb.prepare(`
        SELECT id FROM supplier_catalog_item_attributes WHERE item_id = ? AND name_ar = ?
      `).get(hazelnutFixture.id, nameAr) as { id: number };
      for (const [optionAr, optionEn] of options) {
        insertFixtureOption.run(attribute.id, optionAr, optionEn, now);
      }
    }
    directoryDb.prepare(`
      INSERT INTO suppliers (name, city, region, description, phone, whatsapp, is_active, created_at)
      VALUES ('مورد اختبار الكتالوج', 'الرياض', 'الرياض', 'اختبار', '0500000201', '0500000201', 1, ?)
    `).run(now);
    const supplier = directoryDb.prepare("SELECT id FROM suppliers WHERE phone = ?")
      .get("0500000201") as { id: number };
    const defaultForm = directoryDb.prepare(`
      SELECT id FROM supplier_catalog_item_forms WHERE item_id = ? AND is_active = 1 ORDER BY id LIMIT 1
    `).get(item.id) as { id: number };
    const password = "catalog-test-password";
    directoryDb.prepare(`
      INSERT INTO supplier_users (supplier_id, phone, password_hash, status, created_at)
      VALUES (?, ?, ?, 'active', ?)
    `).run(supplier.id, "0500000201", hashPassword(password), now);

    const approvedSubtype = Number(directoryDb.prepare(`
      INSERT INTO supplier_catalog_subtypes
        (item_id, name_ar, name_en, is_approved, status, created_at, updated_at)
      VALUES (?, 'عبوة اختبار', 'Test pack', 1, 'approved', ?, ?)
    `).run(item.id, now, now).lastInsertRowid);
    directoryDb.prepare(`
      INSERT INTO supplier_catalog_offers (supplier_id, subtype_id, form_id, price, last_updated, is_active)
      VALUES (?, ?, ?, 12, ?, 1)
    `).run(supplier.id, approvedSubtype, defaultForm.id, now);

    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server!.once("listening", resolve);
      server!.once("error", reject);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const api = `http://127.0.0.1:${address.port}/api`;
    const login = await fetch(`${api}/supplier/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "0500000201", password }),
    });
    assert.equal(login.status, 200);
    const supplierCookie = getCookie(login, "bakery_supplier_session");
    const supplierRequest = (url: string, init: RequestInit = {}) =>
      fetch(`${api}${url}`, {
        ...init,
        headers: {
          cookie: supplierCookie,
          ...(init.headers ?? {}),
        },
      });
    const adminExpiry = Math.floor(Date.now() / 1000) + 3600;
    const adminPayload = `admin:${adminExpiry}`;
    const adminCookie = `bakery_admin_session=${adminPayload}.${createHmac("sha256", secret)
      .update(adminPayload).digest("hex")}`;
    const adminRequest = (url: string) => fetch(`${api}${url}`, { headers: { cookie: adminCookie } });
    const adminSend = (url: string, method: string, body: unknown) =>
      fetch(`${api}${url}`, {
        method,
        headers: { cookie: adminCookie, "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    let catalogResponse = await supplierRequest("/supplier/catalog");
    const initialCatalogBody = await catalogResponse.text();
    assert.equal(catalogResponse.status, 200, initialCatalogBody);
    let catalog = JSON.parse(initialCatalogBody) as { profileComplete: boolean };
    assert.equal(catalog.profileComplete, true, "approved active offer completes public eligibility");

    const deletedOffer = directoryDb.prepare(`
      SELECT id FROM supplier_catalog_offers WHERE supplier_id = ? AND subtype_id = ?
    `).get(supplier.id, approvedSubtype) as { id: number };
    const removed = await supplierRequest(`/supplier/catalog/offers/${deletedOffer.id}`, { method: "DELETE" });
    assert.equal(removed.status, 200);
    catalogResponse = await supplierRequest("/supplier/catalog");
    catalog = await catalogResponse.json() as { profileComplete: boolean };
    assert.equal(catalog.profileComplete, false, "soft-deleted offer does not complete visibility");

    const pendingOfferResponse = await supplierRequest("/supplier/catalog/offers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        itemId: item.id,
        formId: defaultForm.id,
        newSubtype: { nameAr: "نوع معلق", nameEn: "Pending type" },
        price: 20,
      }),
    });
    assert.equal(pendingOfferResponse.status, 201);
    const pendingOffer = await pendingOfferResponse.json() as { id: number; subtypeId: number; eligibilityStatus: string };
    assert.equal(pendingOffer.eligibilityStatus, "pending");
    catalogResponse = await supplierRequest("/supplier/catalog");
    catalog = await catalogResponse.json() as { profileComplete: boolean };
    assert.equal(catalog.profileComplete, false, "pending subtype offer does not complete visibility");

    const proposalResponse = await supplierRequest("/supplier/catalog/master-proposals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nameAr: "صنف مقترح للاختبار", nameEn: "Test proposal item" }),
    });
    assert.equal(proposalResponse.status, 201);
    const proposal = await proposalResponse.json() as { id: number };

    const adminBefore = await adminRequest("/admin/catalog");
    assert.equal(adminBefore.status, 200);
    const before = await adminBefore.json() as {
      stats: {
        supplierAccounts: number; completeSupplierProfiles: number; approvedSubtypes: number;
        pendingProposals: number; pendingSubtypes: number;
      };
    };
    assert.equal(before.stats.supplierAccounts, 1);
    assert.equal(before.stats.completeSupplierProfiles, 0);
    assert.equal(before.stats.approvedSubtypes, 1);
    assert.equal(before.stats.pendingSubtypes, 1);
    assert.equal(before.stats.pendingProposals, 2);

    const review = await fetch(`${api}/admin/catalog/subtypes/${pendingOffer.subtypeId}/review`, {
      method: "PATCH",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    });
    assert.equal(review.status, 200);
    catalogResponse = await supplierRequest("/supplier/catalog");
    catalog = await catalogResponse.json() as { profileComplete: boolean };
    assert.equal(catalog.profileComplete, true, "approved subtype makes the active offer eligible");

    const finalOfferRemoved = await supplierRequest(`/supplier/catalog/offers/${pendingOffer.id}`, { method: "DELETE" });
    assert.equal(finalOfferRemoved.status, 200);
    catalogResponse = await supplierRequest("/supplier/catalog");
    catalog = await catalogResponse.json() as { profileComplete: boolean };
    assert.equal(catalog.profileComplete, false);
    const adminAfter = await adminRequest("/admin/catalog");
    const after = await adminAfter.json() as { stats: { completeSupplierProfiles: number; approvedSubtypes: number } };
    assert.equal(after.stats.completeSupplierProfiles, 0);
    assert.equal(after.stats.approvedSubtypes, 2);
    assert.ok(proposal.id > 0);
    assert.equal(
      (directoryDb.prepare(`
        SELECT COUNT(*) AS count FROM supplier_taxonomy_item_suppliers WHERE supplier_id = ? AND item_id = ?
      `).get(supplier.id, item.id) as { count: number }).count,
      1,
      "creating an offer links the supplier to its canonical master item",
    );

    const approveMaster = await adminSend(`/admin/catalog/master-proposals/${proposal.id}/review`, "PATCH", {
      decision: "approved",
      categoryId: item.categoryId,
    });
    assert.equal(approveMaster.status, 200);
    const proposedCanonical = directoryDb.prepare(`
      SELECT id, name, name_en AS nameEn, category_id AS categoryId
      FROM supplier_taxonomy_items WHERE name = ?
    `).get("صنف مقترح للاختبار") as {
      id: number; name: string; nameEn: string; categoryId: number;
    } | undefined;
    assert.ok(proposedCanonical, "approving a master proposal inserts the canonical item");
    assert.equal(proposedCanonical.nameEn, "Test proposal item");
    assert.equal(proposedCanonical.categoryId, item.categoryId);
    const proposedPlacement = directoryDb.prepare(`
      SELECT is_primary AS isPrimary FROM items_categories WHERE item_id = ? AND category_id = ?
    `).get(proposedCanonical.id, item.categoryId) as { isPrimary: number } | undefined;
    assert.equal(proposedPlacement?.isPrimary, 1, "approved master is placed in the chosen category as primary");

    const createdMasterResponse = await adminSend("/admin/catalog/masters", "POST", {
      nameAr: "صنف إداري ثنائي",
      nameEn: "Admin bilingual master",
      categoryId: item.categoryId,
    });
    assert.equal(createdMasterResponse.status, 201);
    const createdMaster = await createdMasterResponse.json() as { id: number };
    const createdMasterRow = directoryDb.prepare(`
      SELECT name, name_en AS nameEn, category_id AS categoryId
      FROM supplier_taxonomy_items WHERE id = ?
    `).get(createdMaster.id) as { name: string; nameEn: string; categoryId: number };
    assert.equal(createdMasterRow.name, "صنف إداري ثنائي");
    assert.equal(createdMasterRow.nameEn, "Admin bilingual master");
    assert.equal(createdMasterRow.categoryId, item.categoryId);
    assert.equal(
      (directoryDb.prepare(`
        SELECT is_primary AS isPrimary FROM items_categories WHERE item_id = ? AND category_id = ?
      `).get(createdMaster.id, item.categoryId) as { isPrimary: number }).isPrimary,
      1,
    );
    const defaultMasterForm = directoryDb.prepare(`
      SELECT id FROM supplier_catalog_item_forms WHERE item_id = ? AND is_active = 1
    `).get(createdMaster.id) as { id: number } | undefined;
    assert.ok(defaultMasterForm, "new canonical items receive a default supplier form");
    const addedFormResponse = await adminSend(`/admin/catalog/masters/${createdMaster.id}/forms`, "POST", {
      nameAr: "خاص",
      nameEn: "Special",
    });
    assert.equal(addedFormResponse.status, 201);
    const addedForm = await addedFormResponse.json() as { id: number; itemId: number };
    assert.equal(addedForm.itemId, createdMaster.id);
    const addedAttributeResponse = await adminSend(`/admin/catalog/masters/${createdMaster.id}/attributes`, "POST", {
      nameAr: "التعبئة",
      nameEn: "Packaging",
      options: [{ nameAr: "كيس", nameEn: "Bag" }],
    });
    assert.equal(addedAttributeResponse.status, 201);
    const addedAttribute = await addedAttributeResponse.json() as {
      id: number; itemId: number; options: Array<{ id: number; nameAr: string }>;
    };
    assert.equal(addedAttribute.itemId, createdMaster.id);
    assert.equal(addedAttribute.options[0]?.nameAr, "كيس");
    const addedOptionsResponse = await adminSend(`/admin/catalog/attributes/${addedAttribute.id}/options`, "POST", {
      options: [{ nameAr: "علبة", nameEn: "Box" }],
    });
    assert.equal(addedOptionsResponse.status, 201);
    assert.equal((await addedOptionsResponse.json() as Array<{ nameAr: string }>)[0]?.nameAr, "علبة");
    const createdSubtypeResponse = await adminSend("/admin/catalog/subtypes", "POST", {
      itemId: createdMaster.id,
      nameAr: "نوع إداري",
      nameEn: "Admin subtype",
    });
    assert.equal(createdSubtypeResponse.status, 201);
    const createdSubtype = await createdSubtypeResponse.json() as {
      id: number; status: string; isApproved: boolean; nameAr: string; nameEn: string;
    };
    assert.equal(createdSubtype.status, "approved");
    assert.equal(createdSubtype.isApproved, true);
    assert.equal(createdSubtype.nameAr, "نوع إداري");
    assert.equal(createdSubtype.nameEn, "Admin subtype");

    const translation = await adminSend(`/admin/catalog/masters/${item.id}`, "PATCH", {
      nameEn: "Imported legacy item translation",
    });
    assert.equal(translation.status, 200);
    assert.equal(
      (directoryDb.prepare("SELECT name_en AS nameEn FROM supplier_taxonomy_items WHERE id = ?")
        .get(item.id) as { nameEn: string }).nameEn,
      "Imported legacy item translation",
      "admin can add English to an existing legacy taxonomy item",
    );

    const rejectedOfferResponse = await supplierRequest("/supplier/catalog/offers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        itemId: item.id,
        formId: defaultForm.id,
        newSubtype: { nameAr: "نوع مرفوض", nameEn: "Rejected type" },
        price: 18,
      }),
    });
    assert.equal(rejectedOfferResponse.status, 201);
    const rejectedOffer = await rejectedOfferResponse.json() as { id: number; subtypeId: number };
    const rejectSubtype = await adminSend(`/admin/catalog/subtypes/${rejectedOffer.subtypeId}/review`, "PATCH", {
      decision: "rejected",
    });
    assert.equal(rejectSubtype.status, 200);
    catalogResponse = await supplierRequest("/supplier/catalog");
    const rejectedCatalog = await catalogResponse.json() as {
      profileComplete: boolean;
      masters: Array<{ id: number; subtypes: Array<{ id: number; status: string }>; offers: Array<{ id: number; eligibilityStatus: string }> }>;
    };
    assert.equal(rejectedCatalog.profileComplete, false, "rejected subtype offer cannot satisfy public visibility");
    const rejectedMaster = rejectedCatalog.masters.find((master) => master.id === item.id);
    assert.equal(rejectedMaster?.subtypes.find((subtype) => subtype.id === rejectedOffer.subtypeId)?.status, "rejected");
    assert.equal(rejectedMaster?.offers.find((offer) => offer.id === rejectedOffer.id)?.eligibilityStatus, "pending");

    const retriedSubtypeResponse = await supplierRequest("/supplier/catalog/offers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        itemId: item.id,
        formId: defaultForm.id,
        newSubtype: { nameAr: "نوع مرفوض", nameEn: "Rejected type" },
        price: 19,
      }),
    });
    assert.equal(retriedSubtypeResponse.status, 201, "a rejected subtype name can be proposed again");
    const retriedSubtype = await retriedSubtypeResponse.json() as { subtypeId: number };
    assert.notEqual(retriedSubtype.subtypeId, rejectedOffer.subtypeId, "rejected subtype history remains intact");
    catalogResponse = await supplierRequest("/supplier/catalog");
    const subtypeRetryCatalog = await catalogResponse.json() as {
      pendingProposals: { subtypes: Array<{ id: number; nameAr: string }> };
    };
    assert.ok(subtypeRetryCatalog.pendingProposals.subtypes.some((subtype) =>
      subtype.id === retriedSubtype.subtypeId && subtype.nameAr === "نوع مرفوض"));

    const retryProposalInput = { nameAr: "اقتراح قابل لإعادة الإرسال", nameEn: "Retryable master proposal" };
    const retryProposalResponse = await supplierRequest("/supplier/catalog/master-proposals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(retryProposalInput),
    });
    assert.equal(retryProposalResponse.status, 201);
    const retryProposal = await retryProposalResponse.json() as { id: number };
    const rejectMaster = await adminSend(`/admin/catalog/master-proposals/${retryProposal.id}/review`, "PATCH", {
      decision: "rejected",
    });
    assert.equal(rejectMaster.status, 200);
    const resubmittedProposalResponse = await supplierRequest("/supplier/catalog/master-proposals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(retryProposalInput),
    });
    assert.equal(resubmittedProposalResponse.status, 201, "a rejected master proposal can be corrected and retried");
    const resubmittedProposal = await resubmittedProposalResponse.json() as { id: number; status: string };
    assert.notEqual(resubmittedProposal.id, retryProposal.id);
    assert.equal(resubmittedProposal.status, "pending");
    catalogResponse = await supplierRequest("/supplier/catalog");
    const masterRetryCatalog = await catalogResponse.json() as {
      pendingProposals: { masters: Array<{ id: number; nameAr: string; status: string }> };
    };
    assert.ok(masterRetryCatalog.pendingProposals.masters.some((entry) =>
      entry.id === retryProposal.id && entry.status === "rejected"));
    assert.ok(masterRetryCatalog.pendingProposals.masters.some((entry) =>
      entry.id === resubmittedProposal.id && entry.status === "pending"));

    const almondOptionsResponse = await fetch(`${api}/catalog/item-filters?category=${encodeURIComponent("لوز")}`);
    assert.equal(almondOptionsResponse.status, 200);
    const almondOptions = await almondOptionsResponse.json() as Array<{
      id: number; name: string; forms: Array<{ id: number; nameAr: string }>;
    }>;
    const almondItems = almondOptions.filter((entry) => almondNames.includes(entry.name));
    assert.equal(almondItems.length, 3, "the isolated fixture exposes all three separate almond items");
    assert.equal(new Set(almondItems.map((entry) => entry.id)).size, 3, "each almond form keeps its own stable item ID");
    const almondForms = new Map(almondItems.map((entry) => [entry.name, entry.forms[0]?.nameAr]));
    assert.deepEqual(
      almondNames.map((name) => almondForms.get(name)),
      ["حب", "شرائح", "مطحون"],
      "almond form names remain attached to the expected item names",
    );

    const hazelnutOptionsResponse = await fetch(`${api}/catalog/item-filters?q=${encodeURIComponent("بندق")}`);
    assert.equal(hazelnutOptionsResponse.status, 200);
    const hazelnutOptions = await hazelnutOptionsResponse.json() as Array<{
      id: number; name: string; forms: Array<{ id: number; nameAr: string }>;
      attributes: Array<{ nameAr: string; options: Array<{ id: number; nameAr: string }> }>;
    }>;
    const hazelnut = hazelnutOptions.find((entry) => entry.name === "بندق");
    assert.ok(hazelnut, "hazelnut item options are available");
    const wholeHazelnut = hazelnut.forms.find((form) => form.nameAr === "صحيح");
    const color = hazelnut.attributes.find((attribute) => attribute.nameAr === "اللون");
    const roast = hazelnut.attributes.find((attribute) => attribute.nameAr === "التحميص");
    const white = color?.options.find((option) => option.nameAr === "أبيض");
    const raw = roast?.options.find((option) => option.nameAr === "ني");
    assert.ok(wholeHazelnut && white && raw, "hazelnut forms and scoped attributes are seeded");

    const curatedNutForms: Record<string, string[]> = {
      بندق: ["صحيح", "مطحون", "مجروش"],
      جوز: ["صحيح", "مفروم", "مجروش"],
      فستق: ["حب", "مطحون", "مجروش"],
    };
    for (const [itemName, expectedForms] of Object.entries(curatedNutForms)) {
      const itemOptionsResponse = await fetch(
        `${api}/catalog/item-filters?q=${encodeURIComponent(itemName)}`,
      );
      assert.equal(itemOptionsResponse.status, 200);
      const itemOptions = await itemOptionsResponse.json() as Array<{
        name: string; forms: Array<{ nameAr: string }>;
      }>;
      const itemOptionsForNut = itemOptions.find((entry) => entry.name === itemName);
      assert.ok(itemOptionsForNut, `${itemName} options are present in isolated catalog fixture`);
      assert.deepEqual(
        itemOptionsForNut.forms.map((form) => form.nameAr).sort(),
        [...expectedForms].sort(),
        `${itemName} has its curated meaningful forms`,
      );
    }

    const wrongItemFormResponse = await supplierRequest("/supplier/catalog/offers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        itemId: hazelnut.id,
        formId: defaultForm.id,
        newSubtype: { nameAr: "شكل غير صالح", nameEn: "Wrong item form" },
      }),
    });
    assert.equal(wrongItemFormResponse.status, 400, "a form cannot be attached to another master item");
    const wrongItemAttributeResponse = await supplierRequest("/supplier/catalog/offers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        itemId: hazelnut.id,
        formId: wholeHazelnut.id,
        attributeOptionIds: [addedAttribute.options[0]!.id],
        newSubtype: { nameAr: "سمة غير صالحة", nameEn: "Wrong item attribute" },
      }),
    });
    assert.equal(wrongItemAttributeResponse.status, 400, "attribute values cannot be attached to another master item");

    const pendingHazelnutResponse = await supplierRequest("/supplier/catalog/offers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        itemId: hazelnut.id,
        formId: wholeHazelnut.id,
        attributeOptionIds: [white.id, raw.id],
        newSubtype: { nameAr: "بندق خام", nameEn: "Raw hazelnuts" },
      }),
    });
    assert.equal(pendingHazelnutResponse.status, 201);
    const pendingHazelnut = await pendingHazelnutResponse.json() as {
      id: number; subtypeId: number; eligibilityStatus: string;
    };
    assert.equal(pendingHazelnut.eligibilityStatus, "pending");
    const filterUrl = new URL(`${api}/suppliers`);
    filterUrl.searchParams.set("category", "بندق");
    filterUrl.searchParams.set("formId", String(wholeHazelnut.id));
    filterUrl.searchParams.append("attributeOptionIds", String(white.id));
    filterUrl.searchParams.append("attributeOptionIds", String(raw.id));
    const pendingFiltered = await fetch(filterUrl);
    assert.equal(pendingFiltered.status, 200);
    assert.equal(
      (await pendingFiltered.json() as Array<{ id: number }>).some((supplierResult) => supplierResult.id === supplier.id),
      false,
      "item forms and attributes do not bypass approved-subtype visibility",
    );

    const approveHazelnut = await adminSend(`/admin/catalog/subtypes/${pendingHazelnut.subtypeId}/review`, "PATCH", {
      decision: "approved",
    });
    assert.equal(approveHazelnut.status, 200);
    const approvedFiltered = await fetch(filterUrl);
    assert.equal(approvedFiltered.status, 200);
    const filteredSuppliers = await approvedFiltered.json() as Array<{
      id: number; offeredSubtypes: Array<{
        itemId: number; formNameAr: string | null;
        attributeOptions: Array<{ optionNameAr: string }>;
      }>;
    }>;
    const matchingSupplier = filteredSuppliers.find((supplierResult) => supplierResult.id === supplier.id);
    assert.ok(matchingSupplier, "approved supplier offer matches its item-scoped form and attributes");
    const matchingOffer = matchingSupplier.offeredSubtypes.find((offer) => offer.itemId === hazelnut.id);
    assert.equal(matchingOffer?.formNameAr, "صحيح");
    assert.deepEqual(
      matchingOffer?.attributeOptions.map((option) => option.optionNameAr).sort(),
      ["أبيض", "ني"].sort(),
    );

    const roasted = roast?.options.find((option) => option.nameAr === "محمص");
    const red = color?.options.find((option) => option.nameAr === "أحمر");
    assert.ok(roasted && red);
    const exactVariantResubmission = await supplierRequest("/supplier/catalog/offers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        itemId: hazelnut.id,
        subtypeId: pendingHazelnut.subtypeId,
        formId: wholeHazelnut.id,
        attributeOptionIds: [raw.id, white.id],
        price: 27,
      }),
    });
    assert.equal(exactVariantResubmission.status, 201);
    const refreshedVariant = await exactVariantResubmission.json() as { id: number; price: number };
    assert.equal(refreshedVariant.id, pendingHazelnut.id, "an exact variant resubmission updates the existing offer");
    assert.equal(refreshedVariant.price, 27);

    const distinctVariantResponse = await supplierRequest("/supplier/catalog/offers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        itemId: hazelnut.id,
        subtypeId: pendingHazelnut.subtypeId,
        formId: wholeHazelnut.id,
        attributeOptionIds: [white.id, roasted.id],
        price: 29,
      }),
    });
    assert.equal(distinctVariantResponse.status, 201);
    const distinctVariant = await distinctVariantResponse.json() as { id: number; attributeOptionIds: number[] };
    assert.notEqual(distinctVariant.id, pendingHazelnut.id, "different values create a distinct offer variant");
    assert.deepEqual(
      distinctVariant.attributeOptionIds.sort((left, right) => left - right),
      [white.id, roasted.id].sort((left, right) => left - right),
    );

    directoryDb.prepare(`
      INSERT INTO suppliers (name, city, region, description, phone, whatsapp, is_active, created_at)
      VALUES ('مورد بندق بلا سمات', 'الرياض', 'الرياض', 'اختبار السمات الاختيارية', '0500000202', '0500000202', 1, ?)
    `).run(now);
    const supplierWithoutAttributes = directoryDb.prepare("SELECT id FROM suppliers WHERE phone = ?")
      .get("0500000202") as { id: number };
    directoryDb.prepare(`
      INSERT INTO supplier_users (supplier_id, phone, password_hash, status, created_at)
      VALUES (?, ?, ?, 'active', ?)
    `).run(supplierWithoutAttributes.id, "0500000202", hashPassword(password), now);
    const unconfiguredLogin = await fetch(`${api}/supplier/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "0500000202", password }),
    });
    assert.equal(unconfiguredLogin.status, 200);
    const unconfiguredCookie = getCookie(unconfiguredLogin, "bakery_supplier_session");
    const unconfiguredOfferResponse = await fetch(`${api}/supplier/catalog/offers`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: unconfiguredCookie },
      body: JSON.stringify({
        itemId: hazelnut.id,
        subtypeId: pendingHazelnut.subtypeId,
        formId: wholeHazelnut.id,
      }),
    });
    assert.equal(unconfiguredOfferResponse.status, 201, "extra attributes can be omitted when saving");
    const unconfiguredOffer = await unconfiguredOfferResponse.json() as {
      id: number; eligibilityStatus: string; attributeOptionIds: number[];
    };
    assert.equal(unconfiguredOffer.eligibilityStatus, "eligible");
    assert.deepEqual(unconfiguredOffer.attributeOptionIds, []);

    const generalHazelnutUrl = new URL(`${api}/suppliers`);
    generalHazelnutUrl.searchParams.set("q", "بندق");
    const generalHazelnutResponse = await fetch(generalHazelnutUrl);
    assert.equal(generalHazelnutResponse.status, 200);
    const generalHazelnutSuppliers = await generalHazelnutResponse.json() as Array<{ id: number }>;
    assert.ok(generalHazelnutSuppliers.some((result) => result.id === supplier.id),
      "the supplier declaring color and roasting appears in general hazelnut results");
    assert.ok(generalHazelnutSuppliers.some((result) => result.id === supplierWithoutAttributes.id),
      "the supplier omitting every optional attribute remains visible in general hazelnut results");

    for (const selectedOptions of [[white.id], [roasted.id], [white.id, roasted.id]]) {
      const refinedUrl = new URL(generalHazelnutUrl);
      for (const optionId of selectedOptions) refinedUrl.searchParams.append("attributeOptionIds", String(optionId));
      const refinedResponse = await fetch(refinedUrl);
      assert.equal(refinedResponse.status, 200);
      const refinedSuppliers = await refinedResponse.json() as Array<{ id: number }>;
      assert.ok(refinedSuppliers.some((result) => result.id === supplier.id),
        "a supplier declaring the selected optional attributes remains visible");
      assert.ok(!refinedSuppliers.some((result) => result.id === supplierWithoutAttributes.id),
        "an unspecified attribute never counts as a match for an explicit filter");
    }

    const collidingEdit = await supplierRequest(`/supplier/catalog/offers/${distinctVariant.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        formId: wholeHazelnut.id,
        attributeOptionIds: [white.id, raw.id],
      }),
    });
    assert.equal(collidingEdit.status, 409, "PATCH refuses to collide with another active variant");
    const collisionBody = await collidingEdit.json() as { conflictingOfferId: number };
    assert.equal(collisionBody.conflictingOfferId, pendingHazelnut.id);

    const reactivatedOtherItemOffer = await supplierRequest("/supplier/catalog/offers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        itemId: item.id,
        subtypeId: approvedSubtype,
        formId: defaultForm.id,
        price: 12,
      }),
    });
    assert.equal(reactivatedOtherItemOffer.status, 201);
    const mismatchedSubtypeUrl = new URL(filterUrl);
    mismatchedSubtypeUrl.searchParams.set("subtypeId", String(approvedSubtype));
    const mismatchedSubtype = await fetch(mismatchedSubtypeUrl);
    assert.equal(mismatchedSubtype.status, 200);
    assert.equal(
      (await mismatchedSubtype.json() as Array<{ id: number }>).some((result) => result.id === supplier.id),
      false,
      "a matching form on one master cannot combine with a matching subtype on another master",
    );
    const mismatchedSubtypeQueryUrl = new URL(filterUrl);
    mismatchedSubtypeQueryUrl.searchParams.delete("category");
    mismatchedSubtypeQueryUrl.searchParams.set("q", "عبوة اختبار");
    const mismatchedSubtypeQuery = await fetch(mismatchedSubtypeQueryUrl);
    assert.equal(mismatchedSubtypeQuery.status, 200);
    assert.equal(
      (await mismatchedSubtypeQuery.json() as Array<{ id: number }>).some((result) => result.id === supplier.id),
      false,
      "a query matching another approved offer's subtype cannot satisfy a configured form filter",
    );
    const supplierNameQueryUrl = new URL(filterUrl);
    supplierNameQueryUrl.searchParams.set("q", "مورد اختبار الكتالوج");
    const supplierNameQuery = await fetch(supplierNameQueryUrl);
    assert.equal(supplierNameQuery.status, 200);
    assert.ok(
      (await supplierNameQuery.json() as Array<{ id: number }>).some((result) => result.id === supplier.id),
      "supplier-name search remains independent of offer-specific matching",
    );
    const mismatchedQueryUrl = new URL(filterUrl);
    mismatchedQueryUrl.searchParams.delete("category");
    mismatchedQueryUrl.searchParams.set("q", item.name);
    const mismatchedQuery = await fetch(mismatchedQueryUrl);
    assert.equal(mismatchedQuery.status, 200);
    assert.equal(
      (await mismatchedQuery.json() as Array<{ id: number }>).some((result) => result.id === supplier.id),
      false,
      "a matching form cannot combine with an item search matching another master",
    );

    const updatedForm = hazelnut.forms.find((form) => form.nameAr === "مطحون");
    assert.ok(updatedForm && red && roasted);
    const updateOffer = await supplierRequest(`/supplier/catalog/offers/${pendingHazelnut.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        price: 25,
        formId: updatedForm.id,
        attributeOptionIds: [red.id, roasted.id],
      }),
    });
    assert.equal(updateOffer.status, 200, "PATCH supports updating offer form and item-scoped attribute values");
    const updatedOffer = await updateOffer.json() as {
      formId: number; attributeOptionIds: number[];
    };
    assert.equal(updatedOffer.formId, updatedForm.id);
    assert.deepEqual(updatedOffer.attributeOptionIds.sort((left, right) => left - right), [red.id, roasted.id].sort((left, right) => left - right));
    const updatedFilterUrl = new URL(`${api}/suppliers`);
    updatedFilterUrl.searchParams.set("category", "بندق");
    updatedFilterUrl.searchParams.set("formId", String(updatedForm.id));
    updatedFilterUrl.searchParams.append("attributeOptionIds", String(red.id));
    updatedFilterUrl.searchParams.append("attributeOptionIds", String(roasted.id));
    const updatedFiltered = await fetch(updatedFilterUrl);
    assert.equal(updatedFiltered.status, 200);
    assert.ok(
      (await updatedFiltered.json() as Array<{ id: number }>).some((result) => result.id === supplier.id),
      "the edited offer matches using the new form and attributes",
    );

    const almondWhole = almondItems.find((entry) => entry.name === "لوز حب");
    const almondWholeForm = almondWhole?.forms.find((form) => form.nameAr === "حب");
    assert.ok(almondWhole && almondWholeForm);
    const almondSubtypeResponse = await adminSend("/admin/catalog/subtypes", "POST", {
      itemId: almondWhole.id,
      nameAr: "لوز كامل للاختبار",
      nameEn: "Test whole almonds",
    });
    assert.equal(almondSubtypeResponse.status, 201);
    const almondSubtype = await almondSubtypeResponse.json() as { id: number };
    const almondOfferResponse = await supplierRequest("/supplier/catalog/offers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        itemId: almondWhole.id,
        subtypeId: almondSubtype.id,
        formId: almondWholeForm.id,
        attributeOptionIds: [],
        price: 16,
      }),
    });
    assert.equal(almondOfferResponse.status, 201);
    directoryDb.prepare("DELETE FROM supplier_almond_variant_preferences WHERE supplier_id = ?").run(supplier.id);
    const almondFormOnlyUrl = new URL(`${api}/suppliers`);
    almondFormOnlyUrl.searchParams.set("category", "لوز");
    almondFormOnlyUrl.searchParams.set("formId", String(almondWholeForm.id));
    const almondFormOnly = await fetch(almondFormOnlyUrl);
    assert.equal(almondFormOnly.status, 200);
    assert.ok(
      (await almondFormOnly.json() as Array<{ id: number }>).some((result) => result.id === supplier.id),
      "a dynamic almond form alone does not require a legacy variant preference",
    );

    directoryDb.prepare(`
      INSERT INTO supplier_almond_variant_preferences (supplier_id, mode, updated_at)
      VALUES (?, 'selected', ?)
    `).run(supplier.id, new Date().toISOString());
    directoryDb.prepare(`
      INSERT INTO supplier_almond_variant_choices (supplier_id, form, preparation, size)
      VALUES (?, 'slices', 'raw', NULL)
    `).run(supplier.id);
    const almondFormAndPreparationUrl = new URL(almondFormOnlyUrl);
    almondFormAndPreparationUrl.searchParams.set("variantPreparation", "raw");
    const mismatchedLegacyForm = await fetch(almondFormAndPreparationUrl);
    assert.equal(mismatchedLegacyForm.status, 200);
    assert.equal(
      (await mismatchedLegacyForm.json() as Array<{ id: number }>).some((result) => result.id === supplier.id),
      false,
      "dynamic whole-almond form is inferred when applying a legacy preparation filter",
    );
    directoryDb.prepare("DELETE FROM supplier_almond_variant_choices WHERE supplier_id = ?").run(supplier.id);
    directoryDb.prepare(`
      INSERT INTO supplier_almond_variant_choices (supplier_id, form, preparation, size)
      VALUES (?, 'whole', 'raw', NULL)
    `).run(supplier.id);
    const matchingLegacyForm = await fetch(almondFormAndPreparationUrl);
    assert.equal(matchingLegacyForm.status, 200);
    assert.ok(
      (await matchingLegacyForm.json() as Array<{ id: number }>).some((result) => result.id === supplier.id),
      "the inferred whole form matches a legacy raw-preparation choice",
    );
  } finally {
    await new Promise<void>((resolve) => {
      if (!server) return resolve();
      server.close(() => resolve());
    });
    closeDatabase?.();
    process.chdir(previousCwd);
    process.env.NODE_ENV = previousNodeEnv;
    if (previousSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSessionSecret;
    await rm(tempRoot, { recursive: true, force: true });
  }
});