import type { FulfilmentMode } from './Order';
import { orderSettingsOf, type StoredOrderSettings } from './orderSettings';

/** The modes this restaurant takes right now: collection always, delivery with at least one postcode, dine-in when switched on. */
export function orderableModesFor(shop: { orderSettings?: StoredOrderSettings | null }): FulfilmentMode[] {
  const s = orderSettingsOf(shop);
  const modes: FulfilmentMode[] = ['collection'];
  if (s.delivery && s.deliveryZones.length > 0) modes.push('delivery');
  if (s.dineIn) modes.push('dine_in');
  return modes;
}
