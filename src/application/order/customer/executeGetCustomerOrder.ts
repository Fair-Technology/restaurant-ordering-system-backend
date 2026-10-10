import { ORDER_NOT_FOUND_ERROR, PAYMENT_CONFIRMING_ERROR } from '../../../domain/order/orderErrors';
import { accessTokenMatches } from '../../../domain/order/orderIds';
import { findCheckoutSessionById } from '../../../infrastructure/cosmos/order/CosmosCheckoutSessionRepository';
import { findOrderById } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import type { ApplicationResult } from '../../_shared/types';
import type { CustomerOrderDto } from './dtos';
import { toCustomerOrderDto } from './toCustomerOrderDto';

/** Shows an order to whoever holds its secret link. A wrong token looks exactly like a missing order. */
export async function executeGetCustomerOrder(
  request: { orderId: string; token: unknown },
  options: { now?: Date } = {},
): Promise<ApplicationResult<CustomerOrderDto>> {
  try {
    let order = request.orderId ? await findOrderById(request.orderId) : null;
    if (!order && request.orderId) {
      // The diner has paid but Stripe has not told us yet: the checkout exists, the order does not.
      const session = await findCheckoutSessionById(request.orderId);
      if (session && accessTokenMatches(session.customerAccessToken, request.token)) {
        return { ok: false, code: 'NOT_FOUND', error: PAYMENT_CONFIRMING_ERROR };
      }
      // Stripe's confirmation may have landed between the two reads: the order was written
      // and the checkout deleted after we looked for the order. Look once more.
      if (!session) order = await findOrderById(request.orderId);
    }
    if (!order || !accessTokenMatches(order.customerAccessToken, request.token)) {
      return { ok: false, code: 'NOT_FOUND', error: ORDER_NOT_FOUND_ERROR };
    }
    const shop = await findShopById(order.shopId);
    if (!shop) return { ok: false, code: 'NOT_FOUND', error: ORDER_NOT_FOUND_ERROR };
    return { ok: true, data: toCustomerOrderDto(order, shop, options.now ?? new Date()) };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve order' };
  }
}
