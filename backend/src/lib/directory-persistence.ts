import { existsSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { RequestHandler, Response } from "express";
import { pool, type PoolClient, type Pool as PgPool } from "../db";
import { captureDirectory, equalRows, recordKey, restoreDirectory, type DirectoryRow, type DirectorySnapshot } from "./directory-snapshot";

type Pool = PgPool;
type Client = PoolClient;
const emptySnapshot = (): DirectorySnapshot => ({ schema: [], rows: new Map() });
const requestContext = new AsyncLocalStorage<{ active: boolean }>();

function assertRequestActive(): void {
  if (requestContext.getStore()?.active === false) {
    throw new Error("Directory request was cancelled or already completed");
  }
}

/**
 * PostgreSQL is authoritative. A single, versioned SQLite projection retains
 * existing SQL semantics. Every request is serialized locally and across
 * replicas; a response is released only after the durable transaction commits.
 */
export class DirectoryPersistence {
  database: DatabaseSync | undefined;
  private version = -1;
  private baseline = emptySnapshot();
  private client: Client | undefined;
  private startupChanges = 0;
  private releaseQueue: (() => void) | undefined;
  private queue: Promise<void> = Promise.resolve();

  constructor(readonly environment: string, private readonly postgres: Pool = pool) {}

  private async lock(): Promise<void> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    this.releaseQueue = release;
    try {
      this.client = await this.postgres.connect();
      await this.client.query("BEGIN");
      await this.client.query("SET LOCAL lock_timeout = '10s'");
      await this.client.query("SET LOCAL statement_timeout = '15s'");
      await this.client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`bakery-directory:${this.environment}`]);
    } catch (error) {
      await this.unlock(false);
      throw error;
    }
  }

  private async unlock(commit: boolean): Promise<void> {
    let failed = false;
    try {
      if (this.client) await this.client.query(commit ? "COMMIT" : "ROLLBACK");
    } catch (error) {
      failed = true;
      // A failed COMMIT must not return an open transaction to the pool.
      if (commit && this.client) {
        try { await this.client.query("ROLLBACK"); } catch { /* destroy the connection below */ }
      }
      throw error;
    } finally {
      this.client?.release(failed);
      this.client = undefined;
      this.releaseQueue?.();
      this.releaseQueue = undefined;
    }
  }

  private async read(): Promise<{ version: number; snapshot: DirectorySnapshot } | null> {
    const state = await this.client!.query<{ version: number; schema: string[] }>(
      "SELECT version, schema FROM directory_state WHERE environment = $1", [this.environment],
    );
    if (!state.rows.length) return null;
    if (state.rows[0]!.version === this.version) return { version: this.version, snapshot: this.baseline };
    const result = await this.client!.query<DirectoryRow>(
      "SELECT table_name, row_key, payload FROM directory_records WHERE environment = $1 ORDER BY table_name, row_key",
      [this.environment],
    );
    return {
      version: state.rows[0]!.version,
      snapshot: { schema: state.rows[0]!.schema, rows: new Map(result.rows.map((row) => [recordKey(row), row])) },
    };
  }

  private replace(snapshot: DirectorySnapshot): void {
    const restored = restoreDirectory(snapshot);
    this.database?.close();
    this.database = restored;
    this.baseline = snapshot;
  }

  async open(legacyDevelopmentFile?: string, allowDevelopmentImport = this.environment === "development"): Promise<void> {
    await this.lock();
    try {
      const existing = await this.read();
      if (existing) {
        this.replace(existing.snapshot);
        this.version = existing.version;
      } else if (allowDevelopmentImport && legacyDevelopmentFile && existsSync(legacyDevelopmentFile)) {
        const legacy = new DatabaseSync(legacyDevelopmentFile, { readOnly: true });
        try {
          legacy.exec("BEGIN");
          this.replace(captureDirectory(legacy));
        } finally { legacy.close(); }
      } else {
        // Production never imports preview accounts or a packaged SQLite file.
        this.database = new DatabaseSync(":memory:");
      }
    } catch (error) {
      await this.unlock(false);
      throw error;
    }
  }

  private changes(): number {
    return Number(this.database!.prepare("SELECT total_changes() AS count").get()!.count);
  }

  private async save(): Promise<void> {
    const snapshot = captureDirectory(this.database!);
    const changed = [...snapshot.rows.entries()]
      .filter(([key, row]) => this.version < 0 || !this.baseline.rows.has(key) || !equalRows(row, this.baseline.rows.get(key)!))
      .map(([, row]) => row);
    const removed = [...this.baseline.rows.entries()].filter(([key]) => !snapshot.rows.has(key)).map(([, row]) => ({
      table_name: row.table_name, row_key: row.row_key,
    }));
    const schemaChanged = JSON.stringify(snapshot.schema) !== JSON.stringify(this.baseline.schema);
    if (this.version >= 0 && !changed.length && !removed.length && !schemaChanged) return;
    if (removed.length) await this.client!.query(`
      DELETE FROM directory_records d
      USING jsonb_to_recordset($2::jsonb) AS x(table_name text, row_key text)
      WHERE d.environment = $1 AND d.table_name = x.table_name AND d.row_key = x.row_key
    `, [this.environment, JSON.stringify(removed)]);
    if (changed.length) await this.client!.query(`
      INSERT INTO directory_records (environment, table_name, row_key, payload)
      SELECT $1, x.table_name, x.row_key, x.payload
      FROM jsonb_to_recordset($2::jsonb) AS x(table_name text, row_key text, payload jsonb)
      ON CONFLICT (environment, table_name, row_key) DO UPDATE SET payload = EXCLUDED.payload
    `, [this.environment, JSON.stringify(changed)]);
    const nextVersion = this.version + 1;
    await this.client!.query(`
      INSERT INTO directory_state (environment, version, schema, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
      ON CONFLICT (environment) DO UPDATE
      SET version = EXCLUDED.version, schema = EXCLUDED.schema, updated_at = NOW()
    `, [this.environment, nextVersion, JSON.stringify(snapshot.schema)]);
    // Cache is only valid after COMMIT; callers invalidate it on any error.
    this.version = nextVersion;
    this.baseline = snapshot;
  }

  async completeStartup(): Promise<void> {
    try {
      await this.save();
      await this.unlock(true);
      this.startupChanges = this.changes();
    } catch (error) {
      this.version = -1;
      await this.unlock(false);
      throw error;
    }
  }

  async beginRequest(): Promise<void> {
    await this.lock();
    try {
      const current = await this.read();
      if (!current) throw new Error("Durable directory is not initialized");
      if (current.version !== this.version) {
        this.replace(current.snapshot);
        this.version = current.version;
      }
      this.startupChanges = this.changes();
    } catch (error) {
      this.version = -1;
      await this.unlock(false);
      throw error;
    }
  }

  async finishRequest(commit: boolean): Promise<void> {
    try {
      if (commit && this.changes() !== this.startupChanges) await this.save();
      if (!commit) this.version = -1;
      await this.unlock(commit);
    } catch (error) {
      this.version = -1;
      await this.unlock(false);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.client) await this.unlock(false);
    this.database?.close();
    this.database = undefined;
  }
}

const productionRuntime = process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
const sqliteTestMode = !productionRuntime && process.env.NODE_ENV === "test" && process.env.DIRECTORY_STORAGE_MODE === "sqlite-test";
export function resolveDirectoryEnvironment(environment: NodeJS.ProcessEnv = process.env): string {
  // Replit's published-runtime flag wins even if a run command sets NODE_ENV.
  if (environment.REPLIT_DEPLOYMENT === "1" || environment.NODE_ENV === "production") return "production";
  if (environment.NODE_ENV === "test" && environment.DIRECTORY_TEST_NAMESPACE) {
    if (!/^test-[a-z0-9-]{1,100}$/.test(environment.DIRECTORY_TEST_NAMESPACE)) {
      throw new Error("Invalid isolated directory test namespace");
    }
    return environment.DIRECTORY_TEST_NAMESPACE;
  }
  return "development";
}
export const directoryPersistence = new DirectoryPersistence(resolveDirectoryEnvironment());

export async function initializeDirectoryStorage(legacyDevelopmentFile: string): Promise<void> {
  if (!sqliteTestMode) await directoryPersistence.open(legacyDevelopmentFile);
}

export function directoryDatabase(legacyDevelopmentFile: string): DatabaseSync {
  if (sqliteTestMode) return new DatabaseSync(legacyDevelopmentFile);
  if (!directoryPersistence.database) throw new Error("Persistent directory must be initialized before loading routes");
  // Prepared statements are created per call in the existing code. This proxy
  // follows the current projection after another replica changes its version.
  return new Proxy({} as DatabaseSync, {
    get(_target, property) {
      assertRequestActive();
      const database = directoryPersistence.database!;
      const value = Reflect.get(database, property);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        assertRequestActive();
        const result = Reflect.apply(value, database, args);
        if (property !== "prepare") return result;
        return new Proxy(result as StatementSync, {
          get(statement, method) {
            const member = Reflect.get(statement, method);
            if (typeof member !== "function") return member;
            return (...parameters: unknown[]) => {
              assertRequestActive();
              return Reflect.apply(member, statement, parameters);
            };
          },
        });
      };
    },
  });
}

function unavailable(res: Response): void {
  res.removeHeader("Content-Length");
  res.removeHeader("ETag");
  res.removeHeader("Set-Cookie");
  res.type("json");
  res.status(503).json({ error: "تعذر الوصول إلى التخزين الدائم. لم يتم تأكيد حفظ التعديل؛ أعد المحاولة بعد قليل." });
}

export function createDurableDirectoryMiddleware(store: DirectoryPersistence): RequestHandler {
  return async (req, res, next) => {
  if (sqliteTestMode || req.path === "/healthz") return next();
  try { await store.beginRequest(); } catch { return unavailable(res); }
  if (res.destroyed) {
    await store.finishRequest(false).catch(() => {});
    return;
  }
  const context = { active: true };
  const originalEnd = res.end.bind(res);
  const originalWrite = res.write.bind(res);
  const chunks: Buffer[] = [];
  let ended = false;
  res.once("close", () => {
    if (ended) return;
    ended = true;
    context.active = false;
    void store.finishRequest(false).catch(() => {});
  });
  // Hold even streaming output so a success is never delivered before commit.
  res.write = ((chunk: string | Buffer, encoding?: BufferEncoding | (() => void), callback?: () => void) => {
    if (ended) return false;
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === "string" ? encoding : "utf8"));
    const done = typeof encoding === "function" ? encoding : callback;
    if (done) queueMicrotask(done);
    return true;
  }) as typeof res.write;
  res.end = ((chunk?: string | Buffer | (() => void), encoding?: BufferEncoding | (() => void), callback?: () => void) => {
    if (ended) return res;
    ended = true;
    context.active = false;
    if (typeof chunk === "string" || Buffer.isBuffer(chunk)) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === "string" ? encoding : "utf8"));
    }
    const done = typeof chunk === "function" ? chunk : typeof encoding === "function" ? encoding : callback;
    void store.finishRequest(res.statusCode < 500 && !res.destroyed).then(() => {
      res.end = originalEnd;
      res.write = originalWrite;
      if (!res.destroyed) originalEnd(Buffer.concat(chunks), done);
    }, () => {
      res.end = originalEnd;
      res.write = originalWrite;
      if (!res.destroyed) unavailable(res);
    });
    return res;
  }) as typeof res.end;
  requestContext.run(context, next);
  };
}

export const durableDirectoryMiddleware = createDurableDirectoryMiddleware(directoryPersistence);