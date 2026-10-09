import type { FulfilmentMode, Order } from '../../../domain/order/Order';
import { isBookableSlot, listSlots, type SlotShop } from '../../../domain/order/scheduling';
import {
  SLOT_HOLD_MINUTES,
  placeSlotOf,
  placesTaken,
  slotCapacityOf,
  slotDayOf,
  withPlace,
  withoutPlace,
  type SlotPlacesDoc,
} from '../../../domain/order/slotCapacity';
import type { Shop } from '../../../domain/shop/Shop';
import {
  createSlotPlaces,
  findSlotPlacesWithEtag,
  replaceSlotPlacesIfMatch,
} from '../../../infrastructure/cosmos/usage/CosmosSlotPlacesRepository';

export const SLOT_WRITE_ATTEMPTS = 5;

type DayChange = (doc: SlotPlacesDoc | null) => SlotPlacesDoc | 'full' | null;

/** Reads one restaurant day, applies `change`, writes it only if nobody changed it meanwhile. */
async function changeDay(shopId: string, day: string, change: DayChange): Promise<'ok' | 'full' | 'unchanged' | 'conflict'> {
  for (let attempt = 0; attempt < SLOT_WRITE_ATTEMPTS; attempt++) {
    const found = await findSlotPlacesWithEtag(shopId, day);
    const next = change(found?.doc ?? null);
    if (next === 'full') return 'full';
    if (next === null) return 'unchanged';
    const written = found ? await replaceSlotPlacesIfMatch(next, found.etag) : await createSlotPlaces(next);
    if (written === 'ok') return 'ok';
  }
  return 'conflict';
}

/** Holds a place for a booking at checkout; 'full' when the limit is reached (or five writes in a row lost). Throws on a Cosmos error. */
export async function holdSlotPlace(input: {
  shop: Pick<Shop, 'id' | 'timezone' | 'orderSettings'>;
  orderId: string;
  slot: Date;
  now: Date;
}): Promise<'ok' | 'full'> {
  const { shop, orderId, now } = input;
  const slot = input.slot.toISOString();
  const day = slotDayOf(slot, shop.timezone);
  const place = { orderId, slot, heldUntil: new Date(now.getTime() + SLOT_HOLD_MINUTES * 60_000).toISOString() };
  const cap = slotCapacityOf(shop);
  const res = await changeDay(shop.id, day, (doc) => withPlace(doc, { shopId: shop.id, day }, place, cap, now));
  return res === 'ok' ? 'ok' : 'full';
}

/** Makes an order's place permanent whatever the limit (a paid booking, or an accepted order for now). Never throws. */
export async function fixSlotPlace(input: {
  shop: Pick<Shop, 'id' | 'timezone'>;
  orderId: string;
  slot: string; // ISO slot start
  now: Date;
}): Promise<void> {
  const { shop, orderId, now } = input;
  const slot = new Date(Date.parse(input.slot)).toISOString();
  const day = slotDayOf(slot, shop.timezone);
  try {
    const res = await changeDay(shop.id, day, (doc) =>
      withPlace(doc, { shopId: shop.id, day }, { orderId, slot, heldUntil: null }, null, now),
    );
    if (res !== 'ok') console.error('[slots:error] could not keep the place', orderId);
  } catch {
    console.error('[slots:error] could not keep the place', orderId);
  }
}

/** Frees a closed order's place, if it has one. Never throws. */
export async function releaseSlotPlace(input: {
  shop: Pick<Shop, 'id' | 'timezone'>;
  order: Pick<Order, 'id' | 'scheduledFor' | 'readyAt'>;
  now: Date;
}): Promise<void> {
  const { shop, order, now } = input;
  const slot = placeSlotOf(order);
  if (!slot) return;
  try {
    const res = await changeDay(shop.id, slotDayOf(slot, shop.timezone), (doc) => withoutPlace(doc, order.id, now));
    if (res === 'conflict') console.error('[slots:error] could not free the place', order.id);
  } catch {
    console.error('[slots:error] could not free the place', order.id);
  }
}

/** Live places per slot start, over the restaurant days the given slots fall on. */
export async function loadSlotsTaken(
  shop: Pick<Shop, 'id' | 'timezone'>,
  slots: readonly string[],
  now: Date,
): Promise<Record<string, number>> {
  const days = [...new Set(slots.map((s) => slotDayOf(s, shop.timezone)))];
  const docs = await Promise.all(days.map(async (d) => (await findSlotPlacesWithEtag(shop.id, d))?.doc ?? null));
  return placesTaken(docs, now);
}

export interface BookableSlots {
  slots: string[]; // listSlots minus full quarter hours
  slotAvailable: boolean | null; // null when no time was chosen
}

/** The times a diner may book now, and whether the chosen one is still free. Reads places only while a limit is in force. */
export async function loadBookableSlots(
  shop: SlotShop & Pick<Shop, 'id'>,
  mode: FulfilmentMode,
  now: Date,
  chosen: Date | null,
): Promise<BookableSlots> {
  const all = listSlots(shop, mode, now);
  const bookable = chosen ? isBookableSlot(shop, mode, chosen, now) : null;
  const cap = slotCapacityOf(shop);
  if (cap === null || (all.length === 0 && bookable !== true)) return { slots: all, slotAvailable: bookable };
  const chosenIso = chosen ? chosen.toISOString() : null;
  const taken = await loadSlotsTaken(shop, chosenIso ? [...all, chosenIso] : all, now);
  const free = (s: string): boolean => (taken[s] ?? 0) < cap;
  return { slots: all.filter(free), slotAvailable: chosenIso ? bookable === true && free(chosenIso) : null };
}
