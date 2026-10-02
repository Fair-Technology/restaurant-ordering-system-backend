import type { Order, OrderActor } from '../../../domain/order/Order';
import { ORDER_CHANGED_ERROR, ORDER_NOT_FOUND_ERROR } from '../../../domain/order/orderErrors';
import type { TransitionResult } from '../../../domain/order/orderLifecycle';
import { findOrderWithEtag, replaceOrderIfMatch } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import type { ShopActor } from '../../_shared/shopAccess';
import type { ApplicationError } from '../../_shared/types';

export function shopActorToOrderActor(actor: ShopActor): OrderActor {
  return { type: actor.actorType, id: actor.actorId };
}

/**
 * Reads the order, applies `change`, and writes it back only if nobody else changed it in between
 * (so accept, auto-decline and cancel can race safely). `shopId: null` skips the owning-shop check,
 * for callers that proved access another way (the diner's secret token).
 */
export async function transitionOrder(input: {
  orderId: string;
  shopId: string | null;
  change: (current: Order) => TransitionResult;
}): Promise<{ ok: true; order: Order; previous: Order } | ApplicationError> {
  const found = await findOrderWithEtag(input.orderId);
  if (!found || (input.shopId !== null && found.order.shopId !== input.shopId)) {
    return { ok: false, code: 'NOT_FOUND', error: ORDER_NOT_FOUND_ERROR };
  }
  const result = input.change(found.order);
  if (!result.ok) return { ok: false, code: 'CONFLICT', error: result.error };
  const written = await replaceOrderIfMatch(result.order, found.etag);
  if (written === 'conflict') return { ok: false, code: 'CONFLICT', error: ORDER_CHANGED_ERROR };
  return { ok: true, order: result.order, previous: found.order };
}
