import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pool } from "../db";

test("actual supplier registration and approval survive fresh backend processes", async () => {
  const namespace = `test-onboarding-${randomUUID()}`;
  const cwd = await mkdtemp(path.join(os.tmpdir(), "persistent-onboarding-"));
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const base = `http://127.0.0.1:${port}/api`;
  let process: ChildProcess | undefined;
  const adminPassword = `test-only-${randomUUID()}`;
  const start = async () => {
    process = spawn(globalThis.process.execPath, [path.resolve("dist/index.js")], {
      cwd, stdio: "ignore",
      env: { ...globalThis.process.env, PORT: String(port), NODE_ENV: "test",
        DIRECTORY_STORAGE_MODE: "", DIRECTORY_TEST_NAMESPACE: namespace,
        ADMIN_PASSWORD: adminPassword, SESSION_SECRET: "isolated-persistence-test-session-secret" },
    });
    for (let i = 0; i < 100; i++) {
      if (process.exitCode !== null) throw new Error("Isolated backend could not start");
      try {
        if ((await fetch(`${base}/healthz`)).ok) return;
      } catch { /* startup is still running */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Isolated backend startup timed out");
  };
  const stop = async () => {
    if (!process || process.exitCode !== null) return;
    const child = process;
    await new Promise<void>((resolve) => { child.once("exit", () => resolve()); child.kill("SIGTERM"); });
    process = undefined;
  };
  const login = async () => {
    const response = await fetch(`${base}/admin/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminPassword }),
    });
    assert.equal(response.status, 200);
    return response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  };
  try {
    await start();
    const category = await pool.query(`
      SELECT payload->>'name' AS name FROM directory_records
      WHERE environment=$1 AND table_name='supplier_taxonomy_nodes'
        AND payload->>'is_active'='1' AND payload->>'parent_id' IS NULL
        AND payload->>'name' NOT IN ('الخدمات والاستشارات','خدمات واستشارات')
      ORDER BY row_key LIMIT 1
    `, [namespace]);
    assert.ok(category.rows[0]?.name);
    const registration = await fetch(`${base}/supplier-requests`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessName: "مورد اختبار الحفظ الدائم", contactPerson: "مراجع الاختبار", businessType: "موزع",
        phone: "0500000000", whatsapp: "0500000000", city: "الدمام",
        categories: [category.rows[0].name], availableItems: "دقيق اختبار",
        acceptedTerms: true, acceptedData: true, acceptedBusiness: true, acceptedPublish: true,
      }),
    });
    assert.equal(registration.status, 201);
    const result = await registration.json() as { requestId: number };
    await stop();
    await start();
    let cookie = await login();
    const requests = await (await fetch(`${base}/admin/supplier-requests`, { headers: { Cookie: cookie } })).json() as { id: number; businessName: string; status: string }[];
    const saved = requests.find((row) => row.id === result.requestId);
    assert.equal(saved?.businessName, "مورد اختبار الحفظ الدائم");
    assert.equal(saved?.status, "pending");
    const approval = await fetch(`${base}/admin/supplier-requests/${result.requestId}/approve`, {
      method: "POST", headers: { Cookie: cookie },
    });
    assert.equal(approval.status, 200);
    await stop();
    await start();
    cookie = await login();
    const reviewed = await (await fetch(`${base}/admin/supplier-requests`, { headers: { Cookie: cookie } })).json() as { id: number; status: string }[];
    assert.equal(reviewed.find((row) => row.id === result.requestId)?.status, "approved");
    const suppliers = await (await fetch(`${base}/admin/suppliers`, { headers: { Cookie: cookie } })).json() as { name: string }[];
    assert.ok(suppliers.some((row) => row.name === "مورد اختبار الحفظ الدائم"));
    const publicSuppliers = await (await fetch(`${base}/suppliers`)).json() as { name: string }[];
    assert.ok(!publicSuppliers.some((row) => row.name === "مورد اختبار الحفظ الدائم"),
      "Approval alone must not bypass the approved catalog-offer eligibility rule");
  } finally {
    await stop();
    await pool.query("DELETE FROM directory_records WHERE environment=$1", [namespace]);
    await pool.query("DELETE FROM directory_state WHERE environment=$1", [namespace]);
    await pool.end();
    await rm(cwd, { recursive: true, force: true });
  }
});