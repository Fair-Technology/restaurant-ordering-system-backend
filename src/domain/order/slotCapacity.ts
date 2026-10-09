import type { Shop } from '../shop/Shop';
import type { Order } from './Order';
import { orderSettingsOf } from './orderSettings';
import { localDate } from './orderTimers';
import { SLOT_MINUTES } from './scheduling';

export const SLOT_CAPACITY_MIN = 1;
export const SLOT_CAPACITY_MAX = 50;
export const SLOT_HOLD_MINUTES = 20;

const SLOT_MS = SLOT_MINUTES * 60_000;

/** One order's claim on a quarter hour. */
export interface SlotPlace {
  orderId: string; // checkout session id === order id
  slot: string; // ISO slot start, toISOString() form
  heldUntil: string | null; // ISO end of a checkout hold; null = for good (the order exists)
}

/** Every place taken on one restaurant day; lives in shop_usage (pk /id). */
export interface SlotPlacesDoc {
  id: string; // slotPlacesDocId(shopId, day)
  kind: 'slot_places';
  shopId: string;
  day: string; // 'YYYY-MM-DD', restaurant-local date of the slot starts it holds
  places: SlotPlace[];
  updatedAt: string; // ISO
}

export function slotPlacesDocId(shopId: string, day: string): string {
  return `slots_${shopId}_${day}`;
}

/** The limit in force: the owner's number while orders for later are on; null = no limit. */
export function slotCapacityOf(shop: Pick<Shop, 'orderSettings'>): number | null {
  const s = orderSettingsOf(shop);
  return s.scheduledOrders ? s.slotCapacity : null;
}

/** The quarter hour an instant falls in, as an ISO slot start. */
export function slotStartOf(at: Date): string {
  return new Date(Math.floor(at.getTime() / SLOT_MS) * SLOT_MS).toISOString();
}

/** The quarter hour an order occupies: its booked time, else the quarter hour it is ready once accepted; null = none. */
export function placeSlotOf(o: Pick<Order, 'scheduledFor' | 'readyAt'>): string | null {
  if (o.scheduledFor) return new Date(Date.parse(o.scheduledFor)).toISOString();
  return o.readyAt ? slotStartOf(new Date(o.readyAt)) : null;
}

/** The restaurant day whose record holds this slot. */
export function slotDayOf(slot: string, timeZone: string): string {
  return localDate(slot, timeZone);
}

export function isLivePlace(p: SlotPlace, now: Date): boolean {
  return p.heldUntil === null || Date.parse(p.heldUntil) > now.getTime();
}

export function placesTaken(docs: readonly (SlotPlacesDoc | null)[], now: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of docs) {
    for (const p of d?.places ?? []) {
      if (isLivePlace(p, now)) out[p.slot] = (out[p.slot] ?? 0) + 1;
    }
  }
  return out;
}

/** The day with this order's place set (its earlier one replaced, lapsed holds dropped); 'full' when the limit is reached without it. */
export function withPlace(
  doc: SlotPlacesDoc | null,
  ids: { shopId: string; day: string },
  place: SlotPlace,
  cap: number | null,
  now: Date,
): SlotPlacesDoc | 'full' {
  const live = (doc?.places ?? []).filter((p) => isLivePlace(p, now));
  // A hold never downgrades a place the order already has for good.
  const kept = place.heldUntil !== null ? live.find((p) => p.orderId === place.orderId && p.heldUntil === null) : undefined;
  const others = live.filter((p) => p.orderId !== place.orderId);
  if (kept) place = kept;
  else if (cap !== null && others.filter((p) => p.slot === place.slot).length >= cap) return 'full';
  return {
    id: slotPlacesDocId(ids.shopId, ids.day),
    kind: 'slot_places',
    shopId: ids.shopId,
    day: ids.day,
    places: [...others, place],
    updatedAt: now.toISOString(),
  };
}

/** The day without this order's place; null when it holds none (nothing to write). */
export function withoutPlace(doc: SlotPlacesDoc | null, orderId: string, now: Date): SlotPlacesDoc | null {
  if (!doc || !doc.places.some((p) => p.orderId === orderId)) return null;
  return {
    ...doc,
    places: doc.places.filter((p) => p.orderId !== orderId && isLivePlace(p, now)),
    updatedAt: now.toISOString(),
  };
}

export function parseSlotCapacity(v: unknown): number | null | 'invalid' {
  if (v === null) return null;
  return typeof v === 'number' && Number.isInteger(v) && v >= SLOT_CAPACITY_MIN && v <= SLOT_CAPACITY_MAX
    ? v
    : 'invalid';
}
