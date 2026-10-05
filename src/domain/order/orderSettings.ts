import { legalOf } from '../legal/legalTexts';
import type { Shop } from '../shop/Shop';

export interface OrderSettings {
  autoRejectMinutes: number;
  alertEmail: string | null;
  autoAccept: boolean;
}

export const DEFAULT_ORDER_SETTINGS: OrderSettings = { autoRejectMinutes: 10, alertEmail: null, autoAccept: true };
export const AUTO_REJECT_MIN_MINUTES = 5;
export const AUTO_REJECT_MAX_MINUTES = 30;

/** Defaults merged with what is stored, so a restaurant saved before auto-accept existed counts as on. */
export function orderSettingsOf(shop: { orderSettings?: Partial<OrderSettings> | null }): OrderSettings {
  return { ...DEFAULT_ORDER_SETTINGS, ...(shop.orderSettings ?? {}) };
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
