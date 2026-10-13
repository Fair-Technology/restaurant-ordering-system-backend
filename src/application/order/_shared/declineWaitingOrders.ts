import type { Order } from '../../../domain/order/Order';
import { applyTransition } from '../../../domain/order/orderLifecycle';
import { hasFreshCaptureClaim } from '../../../domain/order/payment';
import type { Shop } from '../../../domain/shop/Shop';
import { findOrdersByShopIdAndStates } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { notifyCustomer } from '../notifications/notifyOrder';
import { releaseClosedOrderPayment } from './releasePayment';
import { transitionOrder } from './transitionOrder';

/** Platform takedown: every order still waiting for an answer is declined and its card hold released. Never throws. */
export async function declineWaitingOrdersForShop(shop: Shop, now: Date): Promise<number> {
  let waiting: Order[];
  try {
    waiting = await findOrdersByShopIdAndStates(shop.id, ['PLACED']);
  } catch {
    console.error('[takedown:error] could not list waiting orders', shop.id);
    return 0;
  }
  let declined = 0;
  for (const o of waiting) {
    try {
      const moved = await transitionOrder({
        orderId: o.id,
        shopId: shop.id,
        change: (x) =>
          hasFreshCaptureClaim(x, now)
            ? { ok: false, error: 'skip' }
            : applyTransition(x, 'REJECTED', { now, actor: { type: 'system' }, reason: 'shop_unavailable' }),
      });
      if (!moved.ok) continue;
      const released = await releaseClosedOrderPayment(moved.order.id, shop, now);
      await notifyCustomer('order_rejected', released.order ?? moved.order, shop);
      declined++;
    } catch {
      console.error('[takedown:error]', o.id);
    }
  }
  return declined;
}
