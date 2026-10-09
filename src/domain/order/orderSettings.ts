import { legalOf } from '../legal/legalTexts';
import type { Shop } from '../shop/Shop';
import { DEFAULT_PREP_MINUTES, type FulfilmentMode } from './Order';

export type WeeklyHours = Shop['openingHours'];

export interface DeliveryZone {
  postcode: string;
  feeCents: number;
  minOrderCents: number;
}

export interface OrderSettings {
  autoRejectMinutes: number;
  alertEmail: string | null;
  autoAccept: boolean;
  dineIn: boolean;
  autoAcceptHours: WeeklyHours | null; // null = automatic all day (when autoAccept)
  prepMinutes: Record<FulfilmentMode, number>; // 5..120 each
  lastOrdersMinutes: number | null; // null = each mode's prep time; 0..120
  busyExtraMinutes: number; // 5..120, what one busy tap adds
  delivery: boolean;
  deliveryHours: WeeklyHours | null; // null = the restaurant's opening hours
  deliveryZones: DeliveryZone[];
  deliveryFeeTaxClassId: string | null; // null = the country's default tax class
  scheduledOrders: boolean; // diners may order for later; off by default
}

/** What is stored: anything may be missing on restaurants saved before a field existed. */
export type StoredOrderSettings = Partial<Omit<OrderSettings, 'prepMinutes'>> & {
  prepMinutes?: Partial<Record<FulfilmentMode, number>>;
};

export const DEFAULT_ORDER_SETTINGS: OrderSettings = {
  autoRejectMinutes: 10,
  alertEmail: null,
  autoAccept: true,
  dineIn: false,
  autoAcceptHours: null,
  prepMinutes: { ...DEFAULT_PREP_MINUTES },
  lastOrdersMinutes: null,
  busyExtraMinutes: 20,
  delivery: false,
  deliveryHours: null,
  deliveryZones: [],
  deliveryFeeTaxClassId: null,
  scheduledOrders: false,
};
export const AUTO_REJECT_MIN_MINUTES = 5;
export const AUTO_REJECT_MAX_MINUTES = 30;
export const PREP_SETTING_MIN = 5;
export const PREP_SETTING_MAX = 120;
export const LAST_ORDERS_MAX = 120;
export const BUSY_MINUTES_MIN = 5;
export const BUSY_MINUTES_MAX = 120;

/** Defaults merged with what is stored, so a restaurant saved before auto-accept existed counts as on. */
export function orderSettingsOf(shop: { orderSettings?: StoredOrderSettings | null }): OrderSettings {
  const stored = shop.orderSettings ?? {};
  return {
    ...DEFAULT_ORDER_SETTINGS,
    ...stored,
    prepMinutes: { ...DEFAULT_ORDER_SETTINGS.prepMinutes, ...(stored.prepMinutes ?? {}) },
  };
}

/** Who gets the "order waiting" email: the Impressum address plus the optional alert address, without duplicates. */
export function escalationRecipients(shop: Pick<Shop, 'legal' | 'orderSettings'>): string[] {
  const candidates = [legalOf(shop).impressum?.email?.trim(), orderSettingsOf(shop).alertEmail?.trim()];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const address of candidates) {
    if (!address || seen.has(address.toLowerCase())) continue;
    seen.add(address.toLowerCase());
    out.push(address);
  }
  return out;
}
