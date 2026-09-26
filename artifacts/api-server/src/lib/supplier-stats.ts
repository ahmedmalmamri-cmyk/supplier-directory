import { directoryDb } from "./directory-db";

type StatEvent = "view" | "contact" | "review";

/** Daily counters supplement historical event logs; dashboards read the event logs
 * so records created before this table existed still appear. */
export function recordSupplierStat(supplierId: number, event: StatEvent, at: string) {
  const column = event === "view" ? "views" : event === "contact" ? "whatsapp_clicks" : "reviews_count";
  const profileViews = event === "view" ? 1 : 0;
  const rating = directoryDb.prepare("SELECT average_rating AS rating FROM suppliers WHERE id = ?")
    .get(supplierId) as { rating: number } | undefined;
  directoryDb.prepare(`
    INSERT INTO supplier_stats (supplier_id, date, ${column}, profile_views, average_rating, created_at)
    VALUES (?, ?, 1, ?, ?, ?)
    ON CONFLICT(supplier_id, date) DO UPDATE SET
      ${column} = ${column} + 1,
      profile_views = profile_views + excluded.profile_views,
      average_rating = excluded.average_rating
  `).run(supplierId, at.slice(0, 10), profileViews, rating?.rating ?? 0, at);
}