import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { request as httpRequest } from "node:http";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import express from "express";
import { pool } from "../db";
import { DirectoryPersistence, createDurableDirectoryMiddleware, resolveDirectoryEnvironment } from "./directory-persistence";
import { captureDirectory, restoreDirectory } from "./directory-snapshot";

test("PostgreSQL directory persistence and response safety", async (t) => {
  const namespace = `test-directory-${randomUUID()}`;
  const isolatedNamespace = `${namespace}-other`;
  const importNamespace = `${namespace}-import`;
  const instances: DirectoryPersistence[] = [];
  const open = async () => {
    const store = new DirectoryPersistence(namespace);
    instances.push(store);
    await store.open();
    return store;
  };
  try {
    await t.test("a published runtime can never select preview or isolated-test rows", () => {
      assert.equal(resolveDirectoryEnvironment({ NODE_ENV: "development", REPLIT_DEPLOYMENT: "1" }), "production");
      assert.equal(resolveDirectoryEnvironment({ NODE_ENV: "test", REPLIT_DEPLOYMENT: "1", DIRECTORY_TEST_NAMESPACE: "test-fixture" }), "production");
      assert.equal(resolveDirectoryEnvironment({ NODE_ENV: "production" }), "production");
      assert.equal(resolveDirectoryEnvironment({ NODE_ENV: "development" }), "development");
    });
    await t.test("legacy import persists every row before marking the import complete", async () => {
      const temp = mkdtempSync(path.join(os.tmpdir(), "directory-import-"));
      const file = path.join(temp, "legacy.sqlite");
      const source = new DatabaseSync(file);
      source.exec(`
        CREATE TABLE records(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);
        CREATE TABLE derived(id INTEGER PRIMARY KEY, record_id INTEGER);
        CREATE TRIGGER derive_record AFTER INSERT ON records BEGIN INSERT INTO derived(record_id) VALUES (new.id); END;
        INSERT INTO records(name) VALUES ('legacy row');
      `);
      source.close();
      const imported = new DirectoryPersistence(importNamespace);
      const reopened = new DirectoryPersistence(importNamespace);
      instances.push(imported, reopened);
      try {
        await imported.open(file, true);
        await imported.completeStartup();
        await imported.close();
        await reopened.open();
        assert.equal(reopened.database!.prepare("SELECT name FROM records").get()!.name, "legacy row");
        assert.equal(reopened.database!.prepare("SELECT count(*) AS n FROM derived").get()!.n, 1);
        await reopened.completeStartup();
      } finally { rmSync(temp, { recursive: true, force: true }); }
    });
    let first = await open();
    first.database!.exec(`
      CREATE TABLE requests (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending');
      CREATE TABLE links (request_id INTEGER REFERENCES requests(id), kind TEXT, PRIMARY KEY(request_id,kind));
      CREATE TABLE archives (label TEXT);
      INSERT INTO requests(id,name) VALUES (50,'deleted earlier');
      DELETE FROM requests;
      INSERT INTO requests(name) VALUES ('durable request');
      INSERT INTO links VALUES (51,'category');
      INSERT INTO archives VALUES ('archived value'),('archived value');
    `);
    await first.completeStartup();

    await t.test("all row shapes and identity sequences survive restart", async () => {
      await first.close();
      first = await open();
      assert.equal(first.database!.prepare("SELECT name FROM requests").get()!.name, "durable request");
      assert.equal(first.database!.prepare("SELECT count(*) AS n FROM archives").get()!.n, 2);
      assert.equal(first.database!.prepare("SELECT count(*) AS n FROM links").get()!.n, 1);
      await first.completeStartup();
      await first.beginRequest();
      const result = first.database!.prepare("INSERT INTO requests(name) VALUES (?)").run("second request");
      assert.equal(Number(result.lastInsertRowid), 52);
      first.database!.prepare("UPDATE requests SET status='approved' WHERE id=51").run();
      await first.finishRequest(true);
    });

    const second = await open();
    await second.completeStartup();
    await t.test("another replica refreshes rows and preserves concurrent writes", async () => {
      assert.equal(second.database!.prepare("SELECT status FROM requests WHERE id=51").get()!.status, "approved");
      await Promise.all(Array.from({ length: 12 }, (_, i) => (async () => {
        const store = i % 2 ? first : second;
        await store.beginRequest();
        store.database!.prepare("INSERT INTO requests(name) VALUES (?)").run(`concurrent-${i}`);
        await store.finishRequest(true);
      })()));
      await first.beginRequest();
      assert.equal(first.database!.prepare("SELECT count(*) AS n FROM requests").get()!.n, 14);
      await first.finishRequest(true);
    });

    await t.test("rollback discards projection changes and restores canonical rows", async () => {
      await first.beginRequest();
      first.database!.exec("UPDATE requests SET name='must not persist'");
      await first.finishRequest(false);
      await first.beginRequest();
      assert.equal(first.database!.prepare("SELECT name FROM requests WHERE id=51").get()!.name, "durable request");
      await first.finishRequest(true);
    });

    await t.test("deletes and compound associations persist", async () => {
      await second.beginRequest();
      second.database!.exec("DELETE FROM links; DELETE FROM requests WHERE id=51");
      await second.finishRequest(true);
      await first.beginRequest();
      assert.equal(first.database!.prepare("SELECT count(*) AS n FROM links").get()!.n, 0);
      assert.equal(first.database!.prepare("SELECT id FROM requests WHERE id=51").get(), undefined);
      await first.finishRequest(true);
    });

    await t.test("environment namespaces never import another environment's rows", async () => {
      const isolated = new DirectoryPersistence(isolatedNamespace);
      instances.push(isolated);
      await isolated.open("artifacts/api-server/data/bakery-directory.sqlite");
      assert.equal(isolated.database!.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get()!.n, 0);
      isolated.database!.exec("CREATE TABLE requests (id INTEGER PRIMARY KEY, name TEXT)");
      await isolated.completeStartup();
      assert.equal(isolated.database!.prepare("SELECT count(*) AS n FROM requests").get()!.n, 0);
    });

    await t.test("HTTP success waits for durable commit; save failures return 503, not success", async () => {
      const app = express();
      app.use(createDurableDirectoryMiddleware(first));
      app.post("/request", (_req, res) => {
        first.database!.prepare("INSERT INTO requests(name) VALUES (?)").run("http request");
        res.cookie("test-session", "not-a-secret");
        res.json({ success: true });
      });
      let slowStarted!: () => void;
      const slowReady = new Promise<void>((resolve) => { slowStarted = resolve; });
      app.get("/slow", (_req, res) => {
        first.database!.prepare("INSERT INTO requests(name) VALUES (?)").run("aborted request");
        res.write("buffered");
        slowStarted();
        setTimeout(() => res.end(), 50);
      });
      app.get("/probe", (_req, res) => res.json({ ready: true }));
      const server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const url = `http://127.0.0.1:${address.port}/request`;
      const finish = first.finishRequest.bind(first);
      let durableFinished = false;
      first.finishRequest = async (commit) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        await finish(commit);
        durableFinished = true;
      };
      try {
        const success = await fetch(url, { method: "POST" });
        assert.equal(success.status, 200);
        assert.equal(durableFinished, true);
        const persisted = await pool.query("SELECT count(*) AS n FROM directory_records WHERE environment=$1 AND payload->>'name'='http request'", [namespace]);
        assert.equal(Number(persisted.rows[0].n), 1);
        first.finishRequest = async () => { await finish(false); throw new Error("simulated durable write failure"); };
        const failure = await fetch(url, { method: "POST" });
        assert.equal(failure.status, 503);
        assert.equal(failure.headers.get("set-cookie"), null);
        assert.equal(((await failure.json()) as { success?: boolean }).success, undefined);
        first.finishRequest = finish;
        await first.beginRequest();
        assert.equal(first.database!.prepare("SELECT count(*) AS n FROM requests WHERE name='http request'").get()!.n, 1);
        await first.finishRequest(true);
        const aborted = httpRequest(url.replace("/request", "/slow"));
        aborted.on("error", () => {});
        aborted.end();
        await slowReady;
        aborted.destroy();
        const probe = await fetch(url.replace("/request", "/probe"), { signal: AbortSignal.timeout(2000) });
        assert.equal(probe.status, 200, "client cancellation must release the cross-replica lock");
        await first.beginRequest();
        assert.equal(first.database!.prepare("SELECT count(*) AS n FROM requests WHERE name='aborted request'").get()!.n, 0);
        await first.finishRequest(true);
      } finally {
        first.finishRequest = finish;
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    await t.test("snapshot restore respects foreign keys and duplicate archive rows", () => {
      const snapshot = captureDirectory(first.database!);
      const restored = restoreDirectory(snapshot);
      try {
        assert.equal(restored.prepare("SELECT count(*) AS n FROM archives").get()!.n, 2);
        assert.equal(restored.prepare("PRAGMA foreign_keys").get()!.foreign_keys, 1);
      } finally { restored.close(); }
    });
  } finally {
    for (const store of instances) await store.close();
    await pool.query("DELETE FROM directory_records WHERE environment=ANY($1::text[])", [[namespace, isolatedNamespace, importNamespace]]);
    await pool.query("DELETE FROM directory_state WHERE environment=ANY($1::text[])", [[namespace, isolatedNamespace, importNamespace]]);
    await pool.end();
  }
});