import type { Shop } from './Shop';

export type OrdersPauseDuration = 'minutes_30' | 'rest_of_day' | 'until_switched_back';
export const ORDERS_PAUSE_DURATIONS: readonly OrdersPauseDuration[] = ['minutes_30', 'rest_of_day', 'until_switched_back'];
export const DEFAULT_MISSED_ORDERS_PAUSE_LIMIT = 3;
export const MAX_MISSED_ORDERS_PAUSE_LIMIT = 10;

export interface OrdersAutoPaused {
  missedOrders: number;
  at: string;
}
export interface OrdersPauseFields {
  ordersPaused: boolean; // in force at `now`
  ordersPausedUntil: string | null; // only while paused and timed
  ordersAutoPaused: OrdersAutoPaused | null; // only while paused
}

const QUARTER_MS = 15 * 60_000;

/** True while the owner's pause is in force. A timed pause is over from its end time on; an unreadable end counts as still paused. */
export function isOrdersPausedAt(shop: Pick<Shop, 'ordersPaused' | 'ordersPausedUntil'>, now: Date): boolean {
  if (shop.ordersPaused !== true) return false;
  if (shop.ordersPausedUntil == null) return true;
  const end = Date.parse(shop.ordersPausedUntil);
  return !Number.isFinite(end) || now.getTime() < end;
}

/** True when it is exactly 04:00 on the wall clock in the zone at this instant. */
function isFourAmLocal(at: Date, timeZone: string): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return get('hour') === '04' && get('minute') === '00';
}

/**
 * When a pause started now ends: null = until switched back; rest_of_day = the next true 04:00 on the shop's wall clock,
 * strictly after now (so at exactly 04:00 it runs to the next day's 04:00), also on clock-change nights.
 */
export function ordersPauseEndAt(duration: OrdersPauseDuration, timeZone: string, now: Date): string | null {
  if (duration === 'until_switched_back') return null;
  if (duration === 'minutes_30') return new Date(now.getTime() + 30 * 60_000).toISOString();
  let t = Math.floor(now.getTime() / QUARTER_MS) * QUARTER_MS + QUARTER_MS;
  for (let i = 0; i < 4 * 49; i++, t += QUARTER_MS) {
    if (isFourAmLocal(new Date(t), timeZone)) return new Date(t).toISOString();
  }
  return new Date(now.getTime() + 24 * 3_600_000).toISOString(); // unreachable for real zones
}

export function ordersPauseFieldsOf(
  shop: Pick<Shop, 'ordersPaused' | 'ordersPausedUntil' | 'ordersAutoPaused'>,
  now: Date,
): OrdersPauseFields {
  const paused = isOrdersPausedAt(shop, now);
  return {
    ordersPaused: paused,
    ordersPausedUntil: paused ? (shop.ordersPausedUntil ?? null) : null,
    ordersAutoPaused: paused ? (shop.ordersAutoPaused ?? null) : null,
  };
}

/** Missed orders in a row before the auto-pause: integer 0 (off) to 10, anything else reads as the default 3. */
export function missedOrdersPauseLimitOf(shop: Pick<Shop, 'missedOrdersPauseLimit'>): number {
  const v = shop.missedOrdersPauseLimit;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_MISSED_ORDERS_PAUSE_LIMIT
    ? v
    : DEFAULT_MISSED_ORDERS_PAUSE_LIMIT;
}
