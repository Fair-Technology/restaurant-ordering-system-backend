import type { Order } from '../../../domain/order/Order';
import { applyTransition } from '../../../domain/order/orderLifecycle';
import { hasFreshCaptureClaim, isDueForReleaseRetry } from '../../../domain/order/payment';
import {
  isDueForAutoComplete,
  isDueForAutoReject,
  isDueForEscalation,
} from '../../../domain/order/orderTimers';
import { orderSettingsOf } from '../../../domain/order/orderSettings';
import type { Shop } from '../../../domain/shop/Shop';
import {
  findInvoicedOrdersWithRefunds,
  findOrdersAwaitingRelease,
  findOrdersMissingInvoice,
  findOrdersInState,
  findPlacedOrdersCreatedBefore,
} from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { issueCorrectionForRefund, issueInvoiceForOrder, needsInvoice } from '../invoices/issueInvoice';
import { notifyCustomer, notifyRestaurantEscalation } from '../notifications/notifyOrder';
import { acceptPlacedOrder } from '../_shared/acceptPlacedOrder';
import { releaseClosedOrderPayment } from '../_shared/releasePayment';
import { transitionOrder } from '../_shared/transitionOrder';

const INVOICE_CATCH_UP_DAYS = 7;
const CORRECTION_CATCH_UP_DAYS = 30;

export interface OrderTimersResult {
  escalated: number;
  autoRejected: number;
  autoCompleted: number;
  autoAccepted: number;
  released: number;
  invoicesIssued: number;
  correctionsIssued: number;
}

/**
 * Runs every minute. Accepts waiting orders for restaurants with auto-accept on (the retry for an order
 * the webhook could not accept because the payment service was down). For orders nobody has answered: emails the restaurant after 3 minutes, declines at
 * the restaurant's timeout (and gives the money back). Declined orders whose payment could not be released are retried every 15 minutes. For ready orders nobody collected: completes them once the local day is over.
 * One bad order never stops the rest; a lost race with staff is skipped silently.
 */
export async function executeProcessOrderTimers(input: { now: Date }): Promise<OrderTimersResult> {
  const { now } = input;
  const result: OrderTimersResult = {
    escalated: 0,
    autoRejected: 0,
    autoCompleted: 0,
    autoAccepted: 0,
    released: 0,
    invoicesIssued: 0,
    correctionsIssued: 0,
  };
  const shops = new Map<string, Shop | null>();
  const shopOf = async (id: string): Promise<Shop | null> => {
    if (!shops.has(id)) shops.set(id, await findShopById(id));
    return shops.get(id) ?? null;
  };

  // Every waiting order, whatever its age: auto-accept retries each minute, while escalation and
  // auto-decline check their own times below.
  const placed = await findPlacedOrdersCreatedBefore(now.toISOString());
  for (const o of placed) {
    try {
      const shop = await shopOf(o.shopId);
      if (!shop) continue;
      if (orderSettingsOf(shop).autoAccept) {
        const accepted = await acceptPlacedOrder({ orderId: o.id, shop, actor: { type: 'system' }, now });
        if (accepted.ok) {
          result.autoAccepted++;
          continue;
        }
        // Not accepted (service down, declined card, lost race): what is still waiting falls through to the checks below.
      }
      if (isDueForAutoReject(o, now)) {
        const moved = await transitionOrder({
          orderId: o.id,
          shopId: o.shopId,
          change: (x) =>
            hasFreshCaptureClaim(x, now)
              ? { ok: false, error: 'skip' } // an accept is taking the money right now
              : applyTransition(x, 'REJECTED', { now, actor: { type: 'system' }, reason: 'no_response' }),
        });
        if (moved.ok) {
          const released = await releaseClosedOrderPayment(moved.order.id, shop, now);
          await notifyCustomer('order_rejected', released.order ?? moved.order, shop);
          result.autoRejected++;
        }
      } else if (isDueForEscalation(o, now)) {
        // Written before sending: a crash in between loses one email instead of repeating it every minute.
        const moved = await transitionOrder({
          orderId: o.id,
          shopId: o.shopId,
          change: (x) =>
            x.state === 'PLACED' && !x.escalatedAt
              ? { ok: true, order: { ...x, escalatedAt: now.toISOString() } satisfies Order }
              : { ok: false, error: 'skip' },
        });
        if (moved.ok) {
          await notifyRestaurantEscalation(moved.order, shop);
          result.escalated++;
        }
      }
    } catch {
      console.error('[timers:error] placed order', o.id);
    }
  }

  const ready = await findOrdersInState('READY');
  for (const o of ready) {
    try {
      const shop = await shopOf(o.shopId);
      if (!shop || !isDueForAutoComplete(o, now, shop.timezone)) continue;
      const moved = await transitionOrder({
        orderId: o.id,
        shopId: o.shopId,
        change: (x) => applyTransition(x, 'COMPLETED', { now, actor: { type: 'system' } }),
      });
      if (moved.ok) result.autoCompleted++;
    } catch {
      console.error('[timers:error] ready order', o.id);
    }
  }

  const awaiting = await findOrdersAwaitingRelease();
  for (const o of awaiting) {
    try {
      if (!isDueForReleaseRetry(o, now)) continue;
      const shop = await shopOf(o.shopId);
      if (!shop) continue;
      const { outcome } = await releaseClosedOrderPayment(o.id, shop, now);
      if (outcome === 'released' || outcome === 'refunded') result.released++;
    } catch {
      console.error('[timers:error] release', o.id);
    }
  }

  const since = new Date(now.getTime() - INVOICE_CATCH_UP_DAYS * 24 * 3_600_000).toISOString();
  const uninvoiced = await findOrdersMissingInvoice(since);
  for (const o of uninvoiced) {
    try {
      if (!needsInvoice(o)) continue;
      const shop = await shopOf(o.shopId);
      if (!shop) continue;
      await issueInvoiceForOrder(o, shop, now);
      result.invoicesIssued++;
    } catch {
      console.error('[timers:error] invoice', o.id);
    }
  }

  const correctionsSince = new Date(now.getTime() - CORRECTION_CATCH_UP_DAYS * 24 * 3_600_000).toISOString();
  const refunded = await findInvoicedOrdersWithRefunds(correctionsSince);
  for (const o of refunded) {
    try {
      const shop = await shopOf(o.shopId);
      if (!shop) continue;
      const refunds = o.refunds ?? [];
      for (let i = 0; i < refunds.length; i++) {
        if (refunds[i].correctionNumber) continue;
        if (await issueCorrectionForRefund(o, i, shop, now)) result.correctionsIssued++;
      }
    } catch {
      console.error('[timers:error] correction', o.id);
    }
  }
  return result;
}
