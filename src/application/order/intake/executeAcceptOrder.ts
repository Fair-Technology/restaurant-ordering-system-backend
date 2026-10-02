import type { HttpRequest } from '@azure/functions';
import { PREP_MINUTES_ERROR } from '../../../domain/order/orderErrors';
import { applyTransition } from '../../../domain/order/orderLifecycle';
import { DEFAULT_PREP_MINUTES } from '../../../domain/order/Order';
import { periodKeyFor } from '../../../domain/usage/usagePeriod';
import { incrementAcceptedOrders } from '../../../infrastructure/cosmos/usage/CosmosUsageRepository';
import type { ApplicationResult } from '../../_shared/types';
import { notifyCustomer } from '../notifications/notifyOrder';
import { shopActorToOrderActor, transitionOrder } from '../_shared/transitionOrder';
import { toOrderDto } from '../_shared/toOrderDto';
import type { OrderDto } from '../getOrdersByShop/dtos';
import type { AcceptOrderBody } from './dtos';
import { loadShopForOrderAction } from './loadShopForOrderAction';

const MIN_PREP_MINUTES = 5;
const MAX_PREP_MINUTES = 240;

export async function executeAcceptOrder(
  request: { shopId: string; orderId: string } & AcceptOrderBody,
  httpRequest: HttpRequest,
  options: { now?: Date } = {},
): Promise<ApplicationResult<OrderDto>> {
  try {
    const loaded = await loadShopForOrderAction(request.shopId, httpRequest);
    if (!loaded.ok) return loaded;
    const { shop, actor } = loaded;
    const now = options.now ?? new Date();

    const requested = request.prepMinutes;
    if (
      requested !== undefined &&
      (typeof requested !== 'number' ||
        !Number.isInteger(requested) ||
        requested < MIN_PREP_MINUTES ||
        requested > MAX_PREP_MINUTES)
    ) {
      return { ok: false, code: 'INVALID_INPUT', error: PREP_MINUTES_ERROR };
    }

    const usagePeriodKey = periodKeyFor(now, shop.timezone);
    const moved = await transitionOrder({
      orderId: request.orderId,
      shopId: shop.id,
      change: (current) => {
        const prepMinutes = requested ?? DEFAULT_PREP_MINUTES[current.fulfilmentMode];
        const res = applyTransition(current, 'ACCEPTED', {
          now,
          actor: shopActorToOrderActor(actor),
          readyAt: new Date(now.getTime() + prepMinutes * 60_000),
          prepMinutes,
        });
        return res.ok ? { ok: true, order: { ...res.order, usagePeriodKey } } : res;
      },
    });
    if (!moved.ok) return moved;

    try {
      await incrementAcceptedOrders(shop.id, usagePeriodKey);
    } catch {
      // The order is accepted; a usage counter miss is repaired by reconcileShopUsage.
      console.error('[usage:error] could not count accepted order');
    }
    await notifyCustomer('order_accepted', moved.order, shop);
    return { ok: true, data: toOrderDto(moved.order, now) };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to accept order' };
  }
}
