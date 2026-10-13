import { isWatchedAt } from '../../../domain/order/ordersScreen';
import { findOrdersScreenDoc } from '../../../infrastructure/cosmos/usage/CosmosOrdersScreenRepository';

/** When an orders board last pinged, or null if never. A read error counts as never, so it can never cause a charge. */
export async function loadOrdersScreenLastSeen(shopId: string): Promise<string | null> {
  try {
    return (await findOrdersScreenDoc(shopId))?.lastSeenAt ?? null;
  } catch {
    console.error('[orders-screen:read-error]', shopId);
    return null;
  }
}

/** True while a board was seen in the last 3 minutes. Never throws. */
export async function isOrdersScreenWatched(shopId: string, now: Date): Promise<boolean> {
  return isWatchedAt(await loadOrdersScreenLastSeen(shopId), now);
}
