import { CUSTOMER_CANCEL_REASON } from '../../../domain/order/Order';
import { CANNOT_CANCEL_ERROR, ORDER_NOT_FOUND_ERROR } from '../../../domain/order/orderErrors';
import { accessTokenMatches } from '../../../domain/order/orderIds';
import { applyTransition } from '../../../domain/order/orderLifecycle';
import { hasFreshCaptureClaim } from '../../../domain/order/payment';
import { findOrderById } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import type { ApplicationResult } from '../../_shared/types';
import { releaseClosedOrderPayment } from '../_shared/releasePayment';
import { notifyCustomer } from '../notifications/notifyOrder';
import { transitionOrder } from '../_shared/transitionOrder';
import type { CustomerOrderDto } from './dtos';
import { toCustomerOrderDto } from './toCustomerOrderDto';

/** The diner cancels from their order page; only possible until the restaurant accepts. */
export async function executeCancelCustomerOrder(
  request: { orderId: string; token: unknown },
  options: { now?: Date } = {},
): Promise<ApplicationResult<CustomerOrderDto>> {
  try {
    const now = options.now ?? new Date();
    const order = request.orderId ? await findOrderById(request.orderId) : null;
    if (!order || !accessTokenMatches(order.customerAccessToken, request.token)) {
      return { ok: false, code: 'NOT_FOUND', error: ORDER_NOT_FOUND_ERROR };
    }
    const shop = await findShopById(order.shopId);
    if (!shop) return { ok: false, code: 'NOT_FOUND', error: ORDER_NOT_FOUND_ERROR };

    const moved = await transitionOrder({
      orderId: order.id,
      shopId: null, // access was proven by the token above
      change: (current) =>
        current.state !== 'PLACED' || hasFreshCaptureClaim(current, now)
          ? { ok: false, error: CANNOT_CANCEL_ERROR }
          : applyTransition(current, 'CANCELLED', {
              now,
              actor: { type: 'customer' },
              reason: CUSTOMER_CANCEL_REASON,
            }),
    });
    if (!moved.ok) return moved;

    const released = await releaseClosedOrderPayment(moved.order.id, shop, now);
    const closed = released.order ?? moved.order;
    await notifyCustomer('order_cancelled', closed, shop);
    return { ok: true, data: toCustomerOrderDto(closed, shop, now) };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to cancel order' };
  }
}
