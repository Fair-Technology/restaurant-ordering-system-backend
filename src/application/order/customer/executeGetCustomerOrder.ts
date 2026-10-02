import { ORDER_NOT_FOUND_ERROR } from '../../../domain/order/orderErrors';
import { accessTokenMatches } from '../../../domain/order/orderIds';
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
    const order = request.orderId ? await findOrderById(request.orderId) : null;
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
