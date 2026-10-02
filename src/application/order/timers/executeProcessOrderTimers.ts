import type { Order } from '../../../domain/order/Order';
import { applyTransition } from '../../../domain/order/orderLifecycle';
import {
  ESCALATE_AFTER_MINUTES,
  isDueForAutoComplete,
  isDueForAutoReject,
  isDueForEscalation,
} from '../../../domain/order/orderTimers';
import type { Shop } from '../../../domain/shop/Shop';
import {
  findOrdersInState,
  findPlacedOrdersCreatedBefore,
} from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { notifyCustomer, notifyRestaurantEscalation } from '../notifications/notifyOrder';
import { transitionOrder } from '../_shared/transitionOrder';

export interface OrderTimersResult {
  escalated: number;
  autoRejected: number;
  autoCompleted: number;
}

/**
 * Runs every minute. For orders nobody has answered: emails the restaurant after 3 minutes, declines at
 * the restaurant's timeout. For ready orders nobody collected: completes them once the local day is over.
 * One bad order never stops the rest; a lost race with staff is skipped silently.
 */
export async function executeProcessOrderTimers(input: { now: Date }): Promise<OrderTimersResult> {
  const { now } = input;
  const result: OrderTimersResult = { escalated: 0, autoRejected: 0, autoCompleted: 0 };
  const shops = new Map<string, Shop | null>();
  const shopOf = async (id: string): Promise<Shop | null> => {
    if (!shops.has(id)) shops.set(id, await findShopById(id));
    return shops.get(id) ?? null;
  };

  const cutoff = new Date(now.getTime() - ESCALATE_AFTER_MINUTES * 60_000).toISOString();
  const placed = await findPlacedOrdersCreatedBefore(cutoff);
  for (const o of placed) {
    try {
      const shop = await shopOf(o.shopId);
      if (!shop) continue;
      if (isDueForAutoReject(o, now)) {
        const moved = await transitionOrder({
          orderId: o.id,
          shopId: o.shopId,
          change: (x) => applyTransition(x, 'REJECTED', { now, actor: { type: 'system' }, reason: 'no_response' }),
        });
        if (moved.ok) {
          await notifyCustomer('order_rejected', moved.order, shop);
          result.autoRejected++;
        }
      } else if (isDueForEscalation(o, now)) {
        // Written before sending: a crash in between loses one email instead of repeating it every minute.
        const moved = await transitionOrder({
          orderId: o.id,
          shopId: o.shopId,
          change: (x) =>
            x.state === 'PLACED' && !x.escalatedAt
              ? { ok: true, order: { ...x, escalatedAt: now.toISOString() } satisfies Order }
              : { ok: false, error: 'skip' },
        });
        if (moved.ok) {
          await notifyRestaurantEscalation(moved.order, shop);
          result.escalated++;
        }
      }
    } catch {
      console.error('[timers:error] placed order', o.id);
    }
  }

  const ready = await findOrdersInState('READY');
  for (const o of ready) {
    try {
      const shop = await shopOf(o.shopId);
      if (!shop || !isDueForAutoComplete(o, now, shop.timezone)) continue;
      const moved = await transitionOrder({
        orderId: o.id,
        shopId: o.shopId,
        change: (x) => applyTransition(x, 'COMPLETED', { now, actor: { type: 'system' } }),
      });
      if (moved.ok) result.autoCompleted++;
    } catch {
      console.error('[timers:error] ready order', o.id);
    }
  }
  return result;
}
