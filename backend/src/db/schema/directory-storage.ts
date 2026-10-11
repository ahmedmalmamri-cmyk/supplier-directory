import { integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Canonical durable rows. SQLite is only a disposable SQL projection of these
// records; no database files or uploaded file bytes are stored in PostgreSQL.
export const directoryStateTable = pgTable("directory_state", {
  environment: text("environment").primaryKey(),
  version: integer("version").notNull(),
  schema: jsonb("schema").$type<string[]>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const directoryRecordsTable = pgTable("directory_records", {
  environment: text("environment").notNull(),
  tableName: text("table_name").notNull(),
  rowKey: text("row_key").notNull(),
  payload: jsonb("payload").$type<Record<string, string | number | null>>().notNull(),
}, (table) => [
  primaryKey({ columns: [table.environment, table.tableName, table.rowKey] }),
]);

export const insertDirectoryStateSchema = createInsertSchema(directoryStateTable);
export const insertDirectoryRecordSchema = createInsertSchema(directoryRecordsTable);
export type DirectoryState = typeof directoryStateTable.$inferSelect;
export type DirectoryRecord = typeof directoryRecordsTable.$inferSelect;