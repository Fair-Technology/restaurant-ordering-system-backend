import { missedOrdersPauseLimitOf, isOrdersPausedAt } from '../../../domain/shop/ordersPause';
import { isShopOffline, type Shop } from '../../../domain/shop/Shop';
import { findShopById, patchShopFields } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { incrementMissedStreak, resetMissedStreak } from '../../../infrastructure/cosmos/usage/CosmosMissedOrdersRepository';
import { logAudit } from '../../_shared/auditHelpers';
import { notifyRestaurantAutoPaused } from '../notifications/notifyOrder';

/** Starts the missed-order count again (someone answered an order, or the owner switched the pause). Never throws. */
export async function resetMissedOrderStreak(shopId: string, now: Date): Promise<void> {
  try {
    await resetMissedStreak(shopId, now);
  } catch {
    console.error('[missed-orders:error] reset', shopId);
  }
}

/**
 * An order timed out unanswered. Counts it; when the shop's limit is reached and it is taking orders,
 * pauses it until switched back and emails the owner. Returns the paused shop, or null if this miss did not pause it. Never throws.
 */
export async function recordMissedOrder(shop: Shop, now: Date): Promise<Shop | null> {
  try {
    const limit = missedOrdersPauseLimitOf(shop);
    if (limit === 0) return null;
    const streak = await incrementMissedStreak(shop.id, now);
    if (streak < limit) return null;
    const fresh = await findShopById(shop.id);
    if (!fresh || isShopOffline(fresh) || isOrdersPausedAt(fresh, now)) return null;
    const at = now.toISOString();
    const ordersAutoPaused = { missedOrders: streak, at };
    await patchShopFields(shop.id, { ordersPaused: true, ordersPausedUntil: null, ordersAutoPaused, updatedAt: at });
    await resetMissedOrderStreak(shop.id, now);
    const paused: Shop = { ...fresh, ordersPaused: true, ordersPausedUntil: null, ordersAutoPaused, updatedAt: at };
    await logAudit({
      shopId: shop.id,
      actorType: 'system',
      actorId: 'missed-orders',
      action: 'shop.orders_auto_paused',
      entityType: 'shop',
      entityId: shop.id,
      entityName: fresh.name,
      changes: [
        { field: 'ordersPaused', from: false, to: true },
        { field: 'missedOrders', from: null, to: streak },
      ],
    });
    await notifyRestaurantAutoPaused(paused, streak);
    console.warn('[missed-orders:auto-paused]', shop.id, streak);
    return paused;
  } catch {
    console.error('[missed-orders:error] record', shop.id);
    return null;
  }
}
