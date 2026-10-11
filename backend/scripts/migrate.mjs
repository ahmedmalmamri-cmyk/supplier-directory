import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('supplier-directory-schema'))");
  await client.query(`
    CREATE TABLE IF NOT EXISTS directory_state (
      environment text PRIMARY KEY,
      version integer NOT NULL,
      schema jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS directory_records (
      environment text NOT NULL,
      table_name text NOT NULL,
      row_key text NOT NULL,
      payload jsonb NOT NULL,
      PRIMARY KEY (environment, table_name, row_key)
    );
  `);
  await client.query("COMMIT");
  console.log("Directory schema is ready. No application records were changed.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
