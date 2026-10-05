import type { HttpRequest } from '@azure/functions';
import { REJECT_REASON_CODES, StaffRejectReason } from '../../../domain/order/Order';
import { ORDER_CHANGED_ERROR, REJECT_REASON_ERROR } from '../../../domain/order/orderErrors';
import { applyTransition } from '../../../domain/order/orderLifecycle';
import { hasFreshCaptureClaim } from '../../../domain/order/payment';
import type { ApplicationResult } from '../../_shared/types';
import { releaseClosedOrderPayment } from '../_shared/releasePayment';
import { notifyCustomer } from '../notifications/notifyOrder';
import { shopActorToOrderActor, transitionOrder } from '../_shared/transitionOrder';
import { toOrderDto } from '../_shared/toOrderDto';
import type { OrderDto } from '../getOrdersByShop/dtos';
import type { RejectOrderBody } from './dtos';
import { loadShopForOrderAction } from './loadShopForOrderAction';

const MAX_NOTE_CHARS = 300;

export async function executeRejectOrder(
  request: { shopId: string; orderId: string } & Partial<RejectOrderBody>,
  httpRequest: HttpRequest,
  options: { now?: Date } = {},
): Promise<ApplicationResult<OrderDto>> {
  try {
    const loaded = await loadShopForOrderAction(request.shopId, httpRequest);
    if (!loaded.ok) return loaded;
    const { shop, actor } = loaded;
    const now = options.now ?? new Date();

    const reason = request.reason;
    if (typeof reason !== 'string' || !(REJECT_REASON_CODES as readonly string[]).includes(reason)) {
      return { ok: false, code: 'INVALID_INPUT', error: REJECT_REASON_ERROR };
    }
    if (request.note !== undefined && (typeof request.note !== 'string' || request.note.length > MAX_NOTE_CHARS)) {
      return { ok: false, code: 'INVALID_INPUT', error: `note must be at most ${MAX_NOTE_CHARS} characters` };
    }
    const note = request.note?.trim();

    const moved = await transitionOrder({
      orderId: request.orderId,
      shopId: shop.id,
      change: (current) => {
        if (hasFreshCaptureClaim(current, now)) return { ok: false, error: ORDER_CHANGED_ERROR };
        const res = applyTransition(current, 'REJECTED', {
          now,
          actor: shopActorToOrderActor(actor),
          reason: reason as StaffRejectReason,
        });
        return res.ok && note ? { ok: true, order: { ...res.order, rejectionNote: note } } : res;
      },
    });
    if (!moved.ok) return moved;

    const released = await releaseClosedOrderPayment(moved.order.id, shop, now);
    const order = released.order ?? moved.order;
    await notifyCustomer('order_rejected', order, shop);
    return { ok: true, data: toOrderDto(order, now) };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to decline order' };
  }
}
