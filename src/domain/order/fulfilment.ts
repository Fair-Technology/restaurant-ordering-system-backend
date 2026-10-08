import type { FulfilmentMode } from './Order';
import { orderSettingsOf, type StoredOrderSettings } from './orderSettings';

// ORDERABLE_MODES and ORDER_MODE_UNAVAILABLE_ERROR are kept until the checkout and quote stop using them.
export const ORDERABLE_MODES: readonly FulfilmentMode[] = ['collection', 'dine_in'];
export const ORDER_MODE_UNAVAILABLE_ERROR = 'Delivery is not available yet';

/** The modes this restaurant takes right now: collection always, delivery with at least one postcode, dine-in when switched on. */
export function orderableModesFor(shop: { orderSettings?: StoredOrderSettings | null }): FulfilmentMode[] {
  const s = orderSettingsOf(shop);
  const modes: FulfilmentMode[] = ['collection'];
  if (s.delivery && s.deliveryZones.length > 0) modes.push('delivery');
  if (s.dineIn) modes.push('dine_in');
  return modes;
}
