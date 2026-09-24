import { directoryDb } from "./directory-db";

export function restoreExpiredBuyerSuspensions(buyerId?: number) {
  const now = new Date().toISOString();
  const expired = buyerId
    ? directoryDb.prepare(`
        SELECT id FROM buyer_users
        WHERE id = ? AND moderation_status = 'suspended'
          AND suspended_until IS NOT NULL AND suspended_until <= ?
      `).all(buyerId, now) as Array<{ id: number }>
    : directoryDb.prepare(`
        SELECT id FROM buyer_users
        WHERE moderation_status = 'suspended'
          AND suspended_until IS NOT NULL AND suspended_until <= ?
      `).all(now) as Array<{ id: number }>;

  for (const buyer of expired) {
    const update = directoryDb.prepare(`
      UPDATE buyer_users
      SET moderation_status = 'active', moderation_reason = NULL,
        moderation_updated_at = ?, suspended_until = NULL
      WHERE id = ? AND moderation_status = 'suspended'
        AND suspended_until IS NOT NULL AND suspended_until <= ?
    `).run(now, buyer.id, now);
    if (Number(update.changes) > 0) {
      directoryDb.prepare(`
        INSERT INTO buyer_moderation_decisions
          (buyer_id, previous_status, new_status, reason, created_at)
        VALUES (?, 'suspended', 'active', ?, ?)
      `).run(buyer.id, "انتهاء مدة الإيقاف المؤقت", now);
    }
  }
}