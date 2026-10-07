import type { FulfilmentMode } from './Order';
import { orderSettingsOf, type StoredOrderSettings } from './orderSettings';

export const ORDERABLE_MODES: readonly FulfilmentMode[] = ['collection', 'dine_in']; // delivery = slice 8
export const ORDER_MODE_UNAVAILABLE_ERROR = 'Delivery is not available yet';

/** The modes this restaurant takes right now: collection always, dine-in when switched on. */
export function orderableModesFor(shop: { orderSettings?: StoredOrderSettings | null }): FulfilmentMode[] {
  return orderSettingsOf(shop).dineIn ? ['collection', 'dine_in'] : ['collection'];
}
