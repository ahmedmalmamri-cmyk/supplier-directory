import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("supplier invitation replacement is pending until matching handoff activation", { timeout: 120_000 }, async () => {
  const previousCwd = process.cwd();
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSessionSecret = process.env.SESSION_SECRET;
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "supplier-invite-replacement-"));
  const secret = "isolated-supplier-invite-test-session-secret";
  process.env.SESSION_SECRET = secret;
  process.env.NODE_ENV = "test";
  let server: ReturnType<typeof import("node:http").createServer> | undefined;
  let closeDatabase: (() => void) | undefined;
  try {
    process.chdir(tempRoot);
    const { default: app } = await import("../app.ts");
    const { directoryDb } = await import("../lib/directory-db.ts");
    closeDatabase = () => directoryDb.close();

    const oldToken = randomBytes(32).toString("base64url");
    const openedAt = "2024-01-02T03:04:05.000Z";
    const sentAt = "2024-01-01T03:04:05.000Z";
    const supplierResult = directoryDb.prepare(`
      INSERT INTO suppliers
        (name, city, region, description, phone, whatsapp, is_active, invite_token,
         invite_sent_at, invite_opened_at, created_at)
      VALUES ('مورد اختبار الدعوة', 'الدمام', 'المنطقة الشرقية', 'اختبار', '0500000301',
        '0500000301', 0, ?, ?, ?, ?)
    `).run(
      createHash("sha256").update(oldToken).digest("hex"),
      sentAt,
      openedAt,
      new Date().toISOString(),
    );
    const supplierId = Number(supplierResult.lastInsertRowid);

    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server!.once("listening", resolve);
      server!.once("error", reject);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const api = `http://127.0.0.1:${address.port}/api`;
    const adminExpiry = Math.floor(Date.now() / 1000) + 3600;
    const adminPayload = `admin:${adminExpiry}`;
    const adminCookie = `bakery_admin_session=${adminPayload}.${createHmac("sha256", secret)
      .update(adminPayload).digest("hex")}`;
    const request = (route: string, body?: unknown) => fetch(`${api}${route}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        cookie: adminCookie,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const firstGeneratedResponse = await request(`/admin/suppliers/${supplierId}/invite`, {});
    assert.equal(firstGeneratedResponse.status, 200);
    const firstGenerated = await firstGeneratedResponse.json() as { token: string };
    assert.equal((await request(`/invites/${firstGenerated.token}`)).status, 404,
      "new pending link must not be usable before activation");
    assert.equal((await request(`/invites/${oldToken}`)).status, 200,
      "generating a replacement must preserve the old active link");
    let inviteState = directoryDb.prepare(`
      SELECT invite_token AS inviteToken, invite_sent_at AS inviteSentAt,
        invite_opened_at AS inviteOpenedAt, invite_completed_at AS inviteCompletedAt
      FROM suppliers WHERE id = ?
    `).get(supplierId) as {
      inviteToken: string; inviteSentAt: string; inviteOpenedAt: string; inviteCompletedAt: string | null;
    };
    assert.equal(inviteState.inviteToken, createHash("sha256").update(oldToken).digest("hex"));
    assert.equal(inviteState.inviteSentAt, sentAt);
    assert.equal(inviteState.inviteOpenedAt, openedAt);
    assert.equal(inviteState.inviteCompletedAt, null);

    const secondGeneratedResponse = await request(`/admin/suppliers/${supplierId}/invite`, {});
    assert.equal(secondGeneratedResponse.status, 200);
    const secondGenerated = await secondGeneratedResponse.json() as { token: string };
    const wrongActivation = await request(`/admin/suppliers/${supplierId}/invite-sent`, {
      token: randomBytes(32).toString("base64url"),
    });
    assert.equal(wrongActivation.status, 409, "unmatched token must be rejected");
    assert.equal((await request(`/invites/${oldToken}`)).status, 200,
      "wrong activation must leave the previous active link usable");
    const staleActivation = await request(`/admin/suppliers/${supplierId}/invite-sent`, {
      token: firstGenerated.token,
    });
    assert.equal(staleActivation.status, 409, "superseded pending token must be rejected");
    assert.equal((await request(`/invites/${oldToken}`)).status, 200,
      "stale activation must not invalidate the previous active invitation");
    assert.equal((await request(`/invites/${secondGenerated.token}`)).status, 404);

    const activated = await request(`/admin/suppliers/${supplierId}/invite-sent`, {
      token: secondGenerated.token,
    });
    assert.equal(activated.status, 200);
    assert.match((await activated.json() as { message: string }).message, /لا يمكن للنظام التحقق من إرسال الرسالة فعلياً/);
    assert.equal((await request(`/invites/${oldToken}`)).status, 404,
      "activation replaces and invalidates the old active link");
    assert.equal((await request(`/invites/${secondGenerated.token}`)).status, 200);
    inviteState = directoryDb.prepare(`
      SELECT invite_token AS inviteToken, invite_sent_at AS inviteSentAt,
        invite_opened_at AS inviteOpenedAt, invite_completed_at AS inviteCompletedAt
      FROM suppliers WHERE id = ?
    `).get(supplierId) as typeof inviteState;
    assert.equal(inviteState.inviteToken, createHash("sha256").update(secondGenerated.token).digest("hex"));
    assert.ok(inviteState.inviteSentAt);
    assert.equal(inviteState.inviteOpenedAt, null, "opening WhatsApp is not evidence that the supplier opened the invitation");
    assert.equal(inviteState.inviteCompletedAt, null);
    assert.equal(
      (directoryDb.prepare("SELECT pending_invite_token_hash AS pending FROM suppliers WHERE id = ?")
        .get(supplierId) as { pending: string | null }).pending,
      null,
    );
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => error ? reject(error) : resolve());
      });
    }
    closeDatabase?.();
    process.chdir(previousCwd);
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSessionSecret;
    await rm(tempRoot, { recursive: true, force: true });
  }
});