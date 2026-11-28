import type { Order } from '../../../domain/order/Order';
import { applyTransition } from '../../../domain/order/orderLifecycle';
import { isPastDeclineTime } from '../../../domain/order/orderTimers';
import { hasFreshCaptureClaim } from '../../../domain/order/payment';
import type { Shop } from '../../../domain/shop/Shop';
import { notifyCustomer } from '../notifications/notifyOrder';
import { transitionOrder } from './transitionOrder';
import { releaseClosedOrderPayment } from './releasePayment';
import { logOrderDecline } from './auditOrderEvents';
import { errorBrief } from '../../_shared/errorBrief';

/**
 * Declines an order that is past its decline time (autoRejectAt) while it is still waiting.
 * Held by a platform key/permission fault it is not the shop's miss, so the reason is payment_unavailable;
 * otherwise no_response. Releases the reservation and tells the diner. Never throws.
 */
export async function rejectTimedOutOrder(input: {
  orderId: string;
  shop: Shop;
  now: Date;
}): Promise<{ rejected: boolean; heldByConfig: boolean; order: Order | null }> {
  const { orderId, shop, now } = input;
  let heldByConfig = false;
  try {
    const moved = await transitionOrder({
      orderId,
      shopId: shop.id,
      change: (x) =>
        !isPastDeclineTime(x, now) || hasFreshCaptureClaim(x, now)
          ? { ok: false, error: 'skip' } // not due, or an accept is taking the money right now
          : applyTransition(x, 'REJECTED', {
              now,
              actor: { type: 'system' },
              reason: (heldByConfig = !!x.captureConfigFailure) ? 'payment_unavailable' : 'no_response',
            }),
    });
    if (!moved.ok) return { rejected: false, heldByConfig: false, order: null };
    await logOrderDecline(shop.id, moved.order, { type: 'system' });
    const released = await releaseClosedOrderPayment(moved.order.id, shop, now);
    await notifyCustomer('order_rejected', released.order ?? moved.order, shop);
    return { rejected: true, heldByConfig, order: released.order ?? moved.order };
  } catch (err: unknown) {
    console.error('[accept:error] could not decline a timed-out order', orderId, errorBrief(err));
    return { rejected: false, heldByConfig: false, order: null };
  }
}
