import { legalOf } from '../legal/legalTexts';
import type { Shop } from '../shop/Shop';

export interface OrderSettings {
  autoRejectMinutes: number;
  alertEmail: string | null;
}

export const DEFAULT_ORDER_SETTINGS: OrderSettings = { autoRejectMinutes: 10, alertEmail: null };
export const AUTO_REJECT_MIN_MINUTES = 5;
export const AUTO_REJECT_MAX_MINUTES = 30;

export function orderSettingsOf(shop: { orderSettings?: OrderSettings | null }): OrderSettings {
  return shop.orderSettings ?? { ...DEFAULT_ORDER_SETTINGS };
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
