import { DatabaseSync, type SQLInputValue } from "node:sqlite";

export type DirectoryRow = {
  table_name: string;
  row_key: string;
  payload: Record<string, string | number | null>;
};
export type DirectorySnapshot = { schema: string[]; rows: Map<string, DirectoryRow> };

function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
export function recordKey(row: Pick<DirectoryRow, "table_name" | "row_key">): string {
  return JSON.stringify([row.table_name, row.row_key]);
}

export function captureDirectory(database: DatabaseSync): DirectorySnapshot {
  const schema = database.prepare(`
    SELECT sql FROM sqlite_master
    WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
      AND type IN ('table', 'index', 'view', 'trigger')
    ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'view' THEN 1 WHEN 'index' THEN 2 ELSE 3 END, rowid
  `).all().map((row) => String(row.sql));
  const tables = database.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table'
      AND (name NOT LIKE 'sqlite_%' OR name = 'sqlite_sequence') ORDER BY name
  `).all();
  const rows = new Map<string, DirectoryRow>();
  for (const table of tables) {
    const name = String(table.name);
    const columns = database.prepare(`PRAGMA table_info(${quote(name)})`).all();
    const primaryKey = columns.filter((column) => Number(column.pk) > 0)
      .sort((a, b) => Number(a.pk) - Number(b.pk)).map((column) => String(column.name));
    const records = database.prepare(`SELECT ${primaryKey.length ? "" : "rowid AS __storage_rowid__, "}* FROM ${quote(name)}`).all();
    for (const raw of records) {
      const values = { ...raw };
      const rowKey = primaryKey.length
        ? JSON.stringify(primaryKey.map((key) => values[key]))
        : `rowid:${values.__storage_rowid__}`;
      delete values.__storage_rowid__;
      for (const value of Object.values(values)) {
        if (value !== null && typeof value !== "string" && typeof value !== "number") {
          throw new Error(`Unsupported persistent column type in ${name}`);
        }
      }
      const record: DirectoryRow = { table_name: name, row_key: rowKey, payload: values as DirectoryRow["payload"] };
      rows.set(recordKey(record), record);
    }
  }
  return { schema, rows };
}

// Replacement is used only for the in-memory projection, never for the
// canonical PostgreSQL rows. Build a fresh database before swapping it in.
export function restoreDirectory(snapshot: DirectorySnapshot): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = OFF");
    const triggers = snapshot.schema.filter((statement) => /^\s*CREATE\s+TRIGGER\b/i.test(statement));
    for (const statement of snapshot.schema) {
      if (!triggers.includes(statement)) database.exec(statement);
    }
    database.exec("BEGIN");
    const allRows = [...snapshot.rows.values()];
    const records = [...allRows.filter((row) => row.table_name !== "sqlite_sequence"),
      ...allRows.filter((row) => row.table_name === "sqlite_sequence")];
    let sequencesCleared = false;
    for (const row of records) {
      if (row.table_name === "sqlite_sequence" && !sequencesCleared) {
        database.exec("DELETE FROM sqlite_sequence");
        sequencesCleared = true;
      }
      const keys = Object.keys(row.payload);
      const values: SQLInputValue[] = keys.map((key) => row.payload[key]!);
      if (row.row_key.startsWith("rowid:")) {
        keys.unshift("rowid");
        values.unshift(Number(row.row_key.slice(6)));
      }
      database.prepare(`INSERT INTO ${quote(row.table_name)} (${keys.map(quote).join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(...values);
    }
    database.exec("COMMIT");
    // Replaying data must not fire insertion triggers and create duplicate
    // derived records. They become active again for normal request writes.
    for (const statement of triggers) database.exec(statement);
    database.exec("PRAGMA foreign_keys = ON");
    if (database.prepare("PRAGMA foreign_key_check").all().length) {
      throw new Error("Persistent directory contains invalid foreign keys");
    }
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function equalRows(a: DirectoryRow, b: DirectoryRow): boolean {
  const keys = Object.keys(a.payload);
  return keys.length === Object.keys(b.payload).length
    && keys.every((key) => a.payload[key] === b.payload[key]);
}