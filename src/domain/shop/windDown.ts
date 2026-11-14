import type { Shop } from './Shop';

/**
 * SPECS §15 "Retention and erasure": a restaurant that leaves keeps its data fully intact for
 * 90 days; then the storefront and menu are deleted, order records are kept anonymised, and
 * invoice snapshots are kept eight years, unchanged (§10).
 *
 * "Leaves" means the shop was deleted (`shop.deletedAt`, written by deleteShop and cleared by
 * restoreShop) — NOT a cancelled subscription and NOT a superadmin taking it offline (SPECS
 * build plan, step 3: the clean-up "concerns a restaurant leaving, not a cancelled subscription").
 */
export const WIND_DOWN_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True once a deleted shop has been gone for the full retention window. Fails safe: a shop that is
 * not deleted, or whose `deletedAt` is missing or unreadable, is never due.
 */
export function isDueForWindDown(shop: Pick<Shop, 'isDeleted' | 'deletedAt'>, now: Date): boolean {
  if (!shop.isDeleted || !shop.deletedAt) return false;
  const deletedAtMs = Date.parse(shop.deletedAt);
  if (Number.isNaN(deletedAtMs)) return false;
  return now.getTime() - deletedAtMs >= WIND_DOWN_RETENTION_DAYS * DAY_MS;
}
