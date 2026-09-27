import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { buildRequestFilter, requestTaxonomyItemJoin } from "./buyer-request-query.ts";

test("buyer request search joins active-taxonomy item names and filters by taxonomy item ID", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE requests (
      id INTEGER PRIMARY KEY,
      category_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      city TEXT NOT NULL
    );
    CREATE TABLE supplier_taxonomy_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE buyer_users (id INTEGER PRIMARY KEY, business_name TEXT);
    INSERT INTO requests VALUES (1, 41, 'طلب توريد', 'وصف الطلب', 'الرياض');
    INSERT INTO supplier_taxonomy_items VALUES (41, 'دقيق أبيض');
    INSERT INTO buyer_users VALUES (1, 'مخبز المدينة');
  `);

  const filters = buildRequestFilter({ categoryId: 41, q: "أبيض" });
  const requests = db.prepare(`
    SELECT r.id
    FROM requests r
    ${requestTaxonomyItemJoin}
    JOIN buyer_users b ON b.id = 1
    WHERE 1 = 1 ${filters.sql}
  `).all(...filters.values) as Array<{ id: number }>;

  assert.deepEqual(requests.map((request) => ({ ...request })), [{ id: 1 }]);
  db.close();
});