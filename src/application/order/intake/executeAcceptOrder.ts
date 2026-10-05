import type { HttpRequest } from '@azure/functions';
import { PREP_MINUTES_ERROR } from '../../../domain/order/orderErrors';
import type { ApplicationResult } from '../../_shared/types';
import { acceptPlacedOrder } from '../_shared/acceptPlacedOrder';
import { shopActorToOrderActor } from '../_shared/transitionOrder';
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

    const accepted = await acceptPlacedOrder({
      orderId: request.orderId,
      shop,
      actor: shopActorToOrderActor(actor),
      now,
      prepMinutes: requested,
    });
    if (!accepted.ok) return accepted;
    const order = accepted.data;
    return { ok: true, data: toOrderDto(order, now) };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to accept order' };
  }
}
