import type { Shop } from '../shop/Shop';
import type { CheckoutSession } from './CheckoutSession';
import { hoursForMode } from './delivery';
import { lastOrdersLeadMinutes } from './kitchenTiming';
import { isOpenForAsapOrder } from './openingHours';
import { slotWithinHours } from './scheduling';

export type ShopUnavailableCause = 'offline_by_superadmin' | 'offline' | 'orders_paused' | 'closed';

/**
 * Whether the shop refuses an order whose card money has just been reserved. Same shop-state refusals as checkout
 * (offline, paused, closed), but "closed" is judged at the moment the diner started paying, not at webhook time.
 */
export function shopRefusalForPaidCheckout(
  shop: Pick<Shop, 'isPaused' | 'offlineBySuperadmin' | 'ordersPaused' | 'openingHours' | 'closures' | 'timezone' | 'orderSettings' | 'busyMode'>,
  session: Pick<CheckoutSession, 'createdAt' | 'scheduledFor' | 'fulfilmentMode'>,
): ShopUnavailableCause | null {
  if (shop.offlineBySuperadmin === true) return 'offline_by_superadmin';
  if (shop.isPaused === true) return 'offline';
  if (shop.ordersPaused === true) return 'orders_paused';
  const mode = session.fulfilmentMode;
  if (session.scheduledFor) return slotWithinHours(shop, mode, new Date(session.scheduledFor)) ? null : 'closed';
  return isOpenForAsapOrder(hoursForMode(shop, mode), shop.closures, shop.timezone, new Date(session.createdAt), lastOrdersLeadMinutes(shop, mode))
    ? null
    : 'closed';
}
