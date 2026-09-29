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
      SELECT i.id, i.category_id AS categoryId
      FROM supplier_taxonomy_items i
      JOIN supplier_taxonomy_nodes n ON n.id = i.category_id AND n.is_active = 1
      LEFT JOIN supplier_taxonomy_nodes parent ON parent.id = n.parent_id
      WHERE i.is_active = 1 AND i.name_en IS NULL
        AND lower(trim(n.name)) NOT IN ('الخدمات والاستشارات', 'خدمات واستشارات')
        AND lower(trim(COALESCE(parent.name, ''))) NOT IN ('الخدمات والاستشارات', 'خدمات واستشارات')
      ORDER BY i.id LIMIT 1
    `).get() as { id: number; categoryId: number } | undefined;
    assert.ok(item, "fixture needs a publicly visible untranslated active taxonomy item");

    const now = new Date().toISOString();
    directoryDb.prepare(`
      INSERT INTO suppliers (name, city, region, description, phone, whatsapp, is_active, created_at)
      VALUES ('مورد اختبار الكتالوج', 'الرياض', 'الرياض', 'اختبار', '0500000201', '0500000201', 1, ?)
    `).run(now);
    const supplier = directoryDb.prepare("SELECT id FROM suppliers WHERE phone = ?")
      .get("0500000201") as { id: number };
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
      INSERT INTO supplier_catalog_offers (supplier_id, subtype_id, price, last_updated, is_active)
      VALUES (?, ?, 12, ?, 1)
    `).run(supplier.id, approvedSubtype, now);

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