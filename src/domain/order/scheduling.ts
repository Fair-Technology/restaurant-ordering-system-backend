import type { Shop } from '../shop/Shop';
import type { FulfilmentMode, Order } from './Order';
import { hoursForMode } from './delivery';
import { autoAcceptsAt, effectivePrepMinutes, lastOrdersLeadMinutes } from './kitchenTiming';
import { isOpenForAsapOrder } from './openingHours';
import { orderSettingsOf } from './orderSettings';
import { localDate } from './orderTimers';

export const SLOT_MINUTES = 15;
export const SCHEDULE_HORIZON_HOURS = 96; // default 16 (Manish 2026-10-09): 4 days
export const SCHEDULABLE_MODES: readonly FulfilmentMode[] = ['collection', 'delivery'];
const SLOT_MS = SLOT_MINUTES * 60_000;
const HORIZON_MS = SCHEDULE_HORIZON_HOURS * 3_600_000;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Pushes `ms` forward, one slot at a time, to the last slot still inside its own local calendar day. */
function extendToLocalDayEnd(ms: number, timeZone: string): number {
  const day = localDate(new Date(ms), timeZone);
  let t = ms;
  while (localDate(new Date(t + SLOT_MS), timeZone) === day) t += SLOT_MS;
  return t;
}

/** The last bookable instant: the 96-hour horizon rounded up to the end of the shop's local day, so the picker's last day is a full one. */
function horizonEndMs(shop: Pick<SlotShop, 'timezone'>, now: Date): number {
  return extendToLocalDayEnd(now.getTime() + HORIZON_MS, shop.timezone);
}

export type SlotShop = Pick<Shop, 'openingHours' | 'closures' | 'timezone' | 'orderSettings' | 'busyMode'>;

/** The slot start a diner sent, or null when it is not an ISO instant on a quarter hour. */
export function parseSlotStart(value: unknown): Date | null {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value)) return null;
  const t = Date.parse(value);
  if (!Number.isFinite(t) || t % SLOT_MS !== 0) return null;
  return new Date(t);
}

function inClosure(shop: Pick<Shop, 'closures'>, at: Date): boolean {
  const t = at.getTime();
  return (shop.closures ?? []).some((c) => Date.parse(c.start) <= t && t < Date.parse(c.end));
}

/** The kitchen could start this order one ready time before the slot, as an as-soon-as-possible order then would be taken. */
export function slotWithinHours(shop: SlotShop, mode: FulfilmentMode, slot: Date): boolean {
  if (inClosure(shop, slot)) return false;
  const kitchenStart = new Date(slot.getTime() - orderSettingsOf(shop).prepMinutes[mode] * 60_000);
  return isOpenForAsapOrder(hoursForMode(shop, mode), shop.closures, shop.timezone, kitchenStart, lastOrdersLeadMinutes(shop, mode));
}

/** Whether a diner may book this slot now. */
export function isBookableSlot(shop: SlotShop, mode: FulfilmentMode, slot: Date, now: Date): boolean {
  if (!orderSettingsOf(shop).scheduledOrders || !SCHEDULABLE_MODES.includes(mode)) return false;
  const t = slot.getTime();
  if (t % SLOT_MS !== 0) return false;
  if (t < now.getTime() + effectivePrepMinutes(shop, mode, now) * 60_000) return false;
  if (t > horizonEndMs(shop, now)) return false;
  return slotWithinHours(shop, mode, slot);
}

/** Every bookable slot start from the earliest possible to the end of the local calendar day the 96-hour horizon falls into, oldest first, as ISO strings. */
export function listSlots(shop: SlotShop, mode: FulfilmentMode, now: Date): string[] {
  if (!orderSettingsOf(shop).scheduledOrders || !SCHEDULABLE_MODES.includes(mode)) return [];
  const first = Math.ceil((now.getTime() + effectivePrepMinutes(shop, mode, now) * 60_000) / SLOT_MS) * SLOT_MS;
  const last = horizonEndMs(shop, now);
  const out: string[] = [];
  for (let t = first; t <= last; t += SLOT_MS) {
    const slot = new Date(t);
    if (slotWithinHours(shop, mode, slot)) out.push(slot.toISOString());
  }
  return out;
}

/** The restaurant is open at the booked time itself (for the "now outside your opening hours" warning). */
export function isOpenAtSlot(
  shop: Pick<Shop, 'openingHours' | 'closures' | 'timezone' | 'orderSettings'>,
  mode: FulfilmentMode,
  slot: Date,
): boolean {
  return isOpenForAsapOrder(hoursForMode(shop, mode), shop.closures, shop.timezone, slot, 0);
}

/** When a scheduled order enters the live queue: one ready time (busy minutes included) before its slot. */
export function queueEntryAt(
  shop: Pick<Shop, 'orderSettings' | 'busyMode' | 'timezone'>,
  o: Pick<Order, 'scheduledFor' | 'fulfilmentMode'>,
  now: Date,
): Date | null {
  if (!o.scheduledFor) return null;
  return new Date(Date.parse(o.scheduledFor) - effectivePrepMinutes(shop, o.fulfilmentMode, now) * 60_000);
}

/** A booked order still waiting for its time: shown under Upcoming, ignored by every alarm and timer. */
export function isUpcoming(
  o: Pick<Order, 'state' | 'scheduledFor' | 'queuedAt' | 'fulfilmentMode'>,
  shop: Pick<Shop, 'orderSettings' | 'busyMode' | 'timezone'>,
  now: Date,
): boolean {
  if (o.state !== 'PLACED' || !o.scheduledFor || o.queuedAt) return false;
  return now.getTime() < queueEntryAt(shop, o, now)!.getTime();
}

/** Whether this order is accepted without staff: ASAP orders as 8a; scheduled ones when they come in, if still open then. */
export function autoAcceptsOrder(
  shop: Pick<Shop, 'orderSettings' | 'timezone' | 'openingHours' | 'closures'>,
  o: Pick<Order, 'createdAt' | 'queuedAt' | 'scheduledFor' | 'fulfilmentMode'>,
): boolean {
  if (!o.scheduledFor) return autoAcceptsAt(shop, new Date(o.createdAt));
  if (!o.queuedAt) return false;
  return autoAcceptsAt(shop, new Date(o.queuedAt)) && isOpenAtSlot(shop, o.fulfilmentMode, new Date(o.scheduledFor));
}

/** The promised ready time on acceptance: the booked time if still ahead, else now + prep. */
export function readyAtFor(o: Pick<Order, 'scheduledFor'>, now: Date, prepMinutes: number): Date {
  if (o.scheduledFor && now.getTime() < Date.parse(o.scheduledFor)) return new Date(Date.parse(o.scheduledFor));
  return new Date(now.getTime() + prepMinutes * 60_000);
}
