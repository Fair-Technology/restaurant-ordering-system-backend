/** No ping for longer than this means nobody is watching an orders board. */
export const ORDERS_SCREEN_STALE_MS = 180_000;
/** A ping this soon after the stored one writes nothing. */
export const ORDERS_SCREEN_WRITE_SKIP_MS = 30_000;

/** One document per restaurant in the shop_usage container: when an open orders board last pinged. */
export interface OrdersScreenDoc {
  id: string;
  kind: 'orders_screen';
  shopId: string;
  lastSeenAt: string;
}

export function ordersScreenDocId(shopId: string): string {
  return `orders_screen_${shopId}`;
}

/** Watched = the last ping is at most 3 minutes old. Missing or unreadable times count as unwatched. */
export function isWatchedAt(lastSeenAt: string | null, now: Date): boolean {
  if (lastSeenAt === null) return false;
  const seen = Date.parse(lastSeenAt);
  return Number.isFinite(seen) && now.getTime() - seen <= ORDERS_SCREEN_STALE_MS;
}
