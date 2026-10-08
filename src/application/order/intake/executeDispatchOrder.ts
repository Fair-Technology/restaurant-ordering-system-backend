import type { HttpRequest } from '@azure/functions';
import { applyTransition } from '../../../domain/order/orderLifecycle';
import type { ApplicationResult } from '../../_shared/types';
import { notifyCustomer } from '../notifications/notifyOrder';
import { shopActorToOrderActor, transitionOrder } from '../_shared/transitionOrder';
import { toOrderDto } from '../_shared/toOrderDto';
import type { OrderDto } from '../getOrdersByShop/dtos';
import { loadShopForOrderAction } from './loadShopForOrderAction';

/** A delivery order leaves the kitchen: the diner is told it is on its way. */
export async function executeDispatchOrder(
  request: { shopId: string; orderId: string },
  httpRequest: HttpRequest,
  options: { now?: Date } = {},
): Promise<ApplicationResult<OrderDto>> {
  try {
    const loaded = await loadShopForOrderAction(request.shopId, httpRequest);
    if (!loaded.ok) return loaded;
    const { shop, actor } = loaded;
    const now = options.now ?? new Date();

    const moved = await transitionOrder({
      orderId: request.orderId,
      shopId: shop.id,
      change: (current) => applyTransition(current, 'OUT_FOR_DELIVERY', { now, actor: shopActorToOrderActor(actor) }),
    });
    if (!moved.ok) return moved;

    await notifyCustomer('order_out_for_delivery', moved.order, shop);
    return { ok: true, data: toOrderDto(moved.order, now) };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to dispatch order' };
  }
}
