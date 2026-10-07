import type { Shop } from '../shop/Shop';
import { FULFILMENT_MODES, type FulfilmentMode } from './Order';
import { isOpenForAsapOrder } from './openingHours';
import { orderSettingsOf, type WeeklyHours } from './orderSettings';
import { localDate } from './orderTimers';

export interface BusyMode {
  extraMinutes: number;
  serviceDate: string; // 'YYYY-MM-DD', serviceDateOf(startedAt)
  startedAt: string; // ISO
}
export interface BusyState {
  active: boolean;
  extraMinutes: number;
}

export const MAX_READY_MINUTES = 240;
export const BUSY_DAY_ENDS_HOUR = 4;
export const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

type TimingShop = Pick<Shop, 'orderSettings' | 'busyMode' | 'timezone'>;

/** The restaurant's "service day": the local date, rolling over at 04:00 instead of midnight. */
export function serviceDateOf(at: Date, timeZone: string): string {
  return localDate(new Date(at.getTime() - BUSY_DAY_ENDS_HOUR * 3_600_000), timeZone);
}

export function isBusyActive(busy: BusyMode | null | undefined, timeZone: string, now: Date): busy is BusyMode {
  return !!busy && busy.serviceDate === serviceDateOf(now, timeZone);
}

export function busyStateOf(shop: TimingShop, now: Date): BusyState {
  return isBusyActive(shop.busyMode, shop.timezone, now)
    ? { active: true, extraMinutes: shop.busyMode.extraMinutes }
    : { active: false, extraMinutes: orderSettingsOf(shop).busyExtraMinutes };
}

/** The restaurant's own prep time for the mode, plus busy minutes while busy mode is on. */
export function effectivePrepMinutes(shop: TimingShop, mode: FulfilmentMode, now: Date): number {
  const busy = isBusyActive(shop.busyMode, shop.timezone, now) ? shop.busyMode.extraMinutes : 0;
  return Math.min(MAX_READY_MINUTES, orderSettingsOf(shop).prepMinutes[mode] + busy);
}

export function effectivePrepByMode(shop: TimingShop, now: Date): Record<FulfilmentMode, number> {
  return {
    collection: effectivePrepMinutes(shop, 'collection', now),
    delivery: effectivePrepMinutes(shop, 'delivery', now),
    dine_in: effectivePrepMinutes(shop, 'dine_in', now),
  };
}

/** Minutes before closing that new as-soon-as-possible orders stop. */
export function lastOrdersLeadMinutes(shop: Pick<Shop, 'orderSettings'>, mode: FulfilmentMode): number {
  const s = orderSettingsOf(shop);
  return s.lastOrdersMinutes ?? s.prepMinutes[mode];
}

/** Whether an order the restaurant received at `placedAt` is accepted without staff. */
export function autoAcceptsAt(shop: Pick<Shop, 'orderSettings' | 'timezone'>, placedAt: Date): boolean {
  const s = orderSettingsOf(shop);
  if (!s.autoAccept) return false;
  if (s.autoAcceptHours === null) return true;
  return isOpenForAsapOrder(s.autoAcceptHours, [], shop.timezone, placedAt, 0);
}

export function parseWeeklyHours(value: unknown): WeeklyHours | null | 'invalid' {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return 'invalid';
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some((k) => !(WEEK_DAYS as readonly string[]).includes(k))) return 'invalid';
  const out = {} as WeeklyHours;
  for (const d of WEEK_DAYS) {
    const list = v[d] ?? [];
    if (!Array.isArray(list) || list.length > 4) return 'invalid';
    const windows: { open: string; close: string }[] = [];
    for (const w of list) {
      if (!w || typeof w !== 'object' || Array.isArray(w)) return 'invalid';
      const { open, close } = w as { open?: unknown; close?: unknown };
      if (typeof open !== 'string' || typeof close !== 'string' || !HHMM.test(open) || !HHMM.test(close)) {
        return 'invalid';
      }
      if (open === close && open !== '00:00') return 'invalid'; // would read as 24 hours
      windows.push({ open, close });
    }
    out[d] = windows;
  }
  return out;
}

/** For the activity log. */
export function describeWeeklyHours(h: WeeklyHours | null): string {
  if (h === null) return 'always';
  const parts = WEEK_DAYS.filter((d) => (h[d] ?? []).length > 0).map(
    (d) => `${d} ${h[d].map((w) => `${w.open}–${w.close}`).join(', ')}`,
  );
  return parts.length === 0 ? 'never' : parts.join('; ');
}

export function describePrepMinutes(p: Record<FulfilmentMode, number>): string {
  return FULFILMENT_MODES.map((m) => `${m} ${p[m]}`).join(', ');
}
