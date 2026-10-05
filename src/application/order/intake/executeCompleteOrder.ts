import type { HttpRequest } from '@azure/functions';
import { applyTransition } from '../../../domain/order/orderLifecycle';
import type { ApplicationResult } from '../../_shared/types';
import { shopActorToOrderActor, transitionOrder } from '../_shared/transitionOrder';
import { toOrderDto } from '../_shared/toOrderDto';
import type { OrderDto } from '../getOrdersByShop/dtos';
import { loadShopForOrderAction } from './loadShopForOrderAction';

/** "Handed over": completes the order. */
export async function executeCompleteOrder(
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
      change: (current) => applyTransition(current, 'COMPLETED', { now, actor: shopActorToOrderActor(actor) }),
    });
    if (!moved.ok) return moved;
    return { ok: true, data: toOrderDto(moved.order, now) };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to complete order' };
  }
}
