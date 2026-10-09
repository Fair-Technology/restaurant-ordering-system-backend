import type { Order, OrderActor } from '../../../domain/order/Order';
import { effectivePrepMinutes } from '../../../domain/order/kitchenTiming';
import { isUpcoming, readyAtFor } from '../../../domain/order/scheduling';
import {
  ORDER_CHANGED_ERROR,
  ORDER_NOT_FOUND_ERROR,
  PAYMENT_CAPTURE_FAILED_ERROR,
  PAYMENT_SERVICE_UNAVAILABLE_ERROR,
  SCHEDULED_NOT_DUE_ERROR,
} from '../../../domain/order/orderErrors';
import { applyTransition } from '../../../domain/order/orderLifecycle';
import type { TransitionResult } from '../../../domain/order/orderLifecycle';
import { hasFreshCaptureClaim } from '../../../domain/order/payment';
import type { Shop } from '../../../domain/shop/Shop';
import { invoiceFileName, invoiceTitle } from '../../../domain/invoice/invoice';
import { slotCapacityOf, slotStartOf } from '../../../domain/order/slotCapacity';
import { periodKeyFor } from '../../../domain/usage/usagePeriod';
import {
  findOrderWithEtag,
  replaceOrderIfMatch,
} from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { incrementAcceptedOrders } from '../../../infrastructure/cosmos/usage/CosmosUsageRepository';
import type { EmailAttachment } from '../../../infrastructure/email/emailSender';
import { renderInvoicePdf } from '../../../infrastructure/pdf/invoicePdf';
import { capturePaymentIntent, isRetryableStripeError } from '../../../infrastructure/stripe/stripeClient';
import type { ApplicationResult } from '../../_shared/types';
import { notifyOrderLimitThresholds } from '../../usage/orderLimitWarnings';
import { fixSlotPlace } from './slotPlaces';
import { issueInvoiceForOrder, needsInvoice } from '../invoices/issueInvoice';
import { issueLoyaltyVoucher } from '../loyalty/issueLoyaltyVoucher';
import { notifyCustomer } from '../notifications/notifyOrder';
import type { AttachedDocument } from '../notifications/emailTemplates';
import { releaseClosedOrderPayment } from './releasePayment';
import { transitionOrder } from './transitionOrder';

const RECORD_ATTEMPTS = 3;

/** First try keeps the plain key; every later claim gets its own, because Stripe replays a stored failure for a repeated key. */
function captureKey(orderId: string, attempts: number): string {
  return attempts <= 1 ? `capture-${orderId}` : `capture-${orderId}-${attempts}`;
}

function withoutClaim(order: Order): Order {
  const { captureStartedAt: _claim, captureAttempts: _attempts, ...rest } = order;
  return rest;
}

/** Puts the order back to "nobody is taking the payment" so staff can simply try again. */
async function clearClaim(orderId: string): Promise<void> {
  for (let attempt = 0; attempt < RECORD_ATTEMPTS; attempt++) {
    const found = await findOrderWithEtag(orderId);
    if (!found || !found.order.captureStartedAt) return;
    const { captureStartedAt: _claim, ...rest } = found.order;
    if ((await replaceOrderIfMatch(rest, found.etag)) === 'ok') return;
  }
}

/** The invoice PDF for the email; a failure is logged and the order is accepted without it. */
async function invoiceForEmail(
  order: Order,
  shop: Shop,
  now: Date,
): Promise<{ order: Order; attachments?: EmailAttachment[]; attachedDocument?: AttachedDocument }> {
  if (!needsInvoice(order)) return { order };
  try {
    const doc = await issueInvoiceForOrder(order, shop, now);
    const pdf = await renderInvoicePdf(doc);
    return {
      order: { ...order, invoiceNumber: doc.number },
      attachments: [
        {
          name: invoiceFileName(doc),
          contentType: 'application/pdf',
          contentInBase64: Buffer.from(pdf).toString('base64'),
        },
      ],
      attachedDocument: { title: invoiceTitle('invoice', doc.language), number: doc.number },
    };
  } catch {
    // The timer issues missing invoices later.
    console.error('[invoice:error] could not issue the invoice at acceptance', order.id);
    return { order };
  }
}

/**
 * Accepts a waiting order: takes the reserved card money, moves the order to ACCEPTED, counts it,
 * issues the invoice and emails the diner. Shared by staff, auto-accept and the timer.
 * A claim is written before the money is taken so decline, cancel and a second accept wait meanwhile.
 * A refused payment declines the order; a Stripe outage leaves it waiting.
 */
export async function acceptPlacedOrder(input: {
  orderId: string;
  shop: Shop;
  actor: OrderActor;
  now: Date;
  prepMinutes?: number;
}): Promise<ApplicationResult<Order>> {
  const { orderId, shop, actor, now } = input;
  const found = await findOrderWithEtag(orderId);
  if (!found || found.order.shopId !== shop.id) {
    return { ok: false, code: 'NOT_FOUND', error: ORDER_NOT_FOUND_ERROR };
  }
  const takesMoney = found.order.payment.method === 'card' && found.order.payment.status === 'authorized';
  const usagePeriodKey = periodKeyFor(now, shop.timezone);

  const accept = (current: Order): TransitionResult => {
    if (isUpcoming(current, shop, now)) return { ok: false, error: SCHEDULED_NOT_DUE_ERROR };
    const prep = input.prepMinutes ?? effectivePrepMinutes(shop, current.fulfilmentMode, now);
    const readyAt = readyAtFor(current, now, prep);
    const prepMinutes = Math.max(1, Math.round((readyAt.getTime() - now.getTime()) / 60_000));
    return applyTransition(current, 'ACCEPTED', { now, actor, readyAt, prepMinutes });
  };

  if (takesMoney) {
    let attempts = 0;
    const claimed = await transitionOrder({
      orderId,
      shopId: shop.id,
      change: (current) => {
        const valid = accept(current);
        if (!valid.ok) return valid;
        if (hasFreshCaptureClaim(current, now) || current.payment.status !== 'authorized') {
          return { ok: false, error: ORDER_CHANGED_ERROR };
        }
        attempts = (current.captureAttempts ?? 0) + 1;
        return {
          ok: true,
          order: { ...current, captureStartedAt: now.toISOString(), captureAttempts: attempts },
        };
      },
    });
    if (!claimed.ok) return claimed;

    const connectAccountId = shop.stripe?.connectAccountId;
    const paymentIntentId = claimed.order.payment.stripePaymentIntentId;
    try {
      if (!connectAccountId || !paymentIntentId) throw new Error('The order has no Stripe payment to take');
      await capturePaymentIntent({
        connectAccountId,
        paymentIntentId,
        idempotencyKey: captureKey(orderId, attempts),
      });
    } catch (err: unknown) {
      if (isRetryableStripeError(err)) {
        await clearClaim(orderId);
        return { ok: false, code: 'CONFLICT', error: PAYMENT_SERVICE_UNAVAILABLE_ERROR };
      }
      console.error('[accept:error] payment refused', orderId);
      const declined = await transitionOrder({
        orderId,
        shopId: shop.id,
        change: (current) =>
          applyTransition(withoutClaim(current), 'REJECTED', {
            now,
            actor: { type: 'system' },
            reason: 'payment_failed',
          }),
      });
      if (!declined.ok) return declined;
      const released = await releaseClosedOrderPayment(orderId, shop, now);
      await notifyCustomer('order_rejected', released.order ?? declined.order, shop);
      return { ok: false, code: 'CONFLICT', error: PAYMENT_CAPTURE_FAILED_ERROR };
    }
  }

  // The money is taken from here on, so recording it is retried; a miss is reported loudly.
  const attemptsAllowed = takesMoney ? RECORD_ATTEMPTS : 1;
  let moved: Awaited<ReturnType<typeof transitionOrder>> | null = null;
  for (let attempt = 0; attempt < attemptsAllowed; attempt++) {
    moved = await transitionOrder({
      orderId,
      shopId: shop.id,
      change: (current) => {
        const res = accept(current);
        if (!res.ok) return res;
        const base = withoutClaim(res.order);
        return {
          ok: true,
          order: {
            ...base,
            payment: takesMoney ? { ...base.payment, status: 'paid' } : base.payment,
            usagePeriodKey,
          },
        };
      },
    });
    if (moved.ok) break;
  }
  if (!moved || !moved.ok) {
    if (takesMoney) {
      console.error('[accept:error] captured but not recorded', orderId);
      return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to accept order' };
    }
    return moved ?? { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to accept order' };
  }

  try {
    const usage = await incrementAcceptedOrders(shop.id, usagePeriodKey);
    await notifyOrderLimitThresholds(shop, usage, now);
  } catch {
    // The order is accepted; a usage counter miss is repaired by reconcileShopUsage.
    console.error('[usage:error] could not count accepted order');
  }
  // Option (c): an order for now takes a place in the quarter hour it is ready; the limit never turns it away.
  if (!moved.order.scheduledFor && moved.order.readyAt && slotCapacityOf(shop) !== null) {
    await fixSlotPlace({ shop, orderId, slot: slotStartOf(new Date(moved.order.readyAt)), now });
  }
  const invoiced = await invoiceForEmail(moved.order, shop, now);
  await notifyCustomer('order_accepted', invoiced.order, shop, {
    attachments: invoiced.attachments,
    attachedDocument: invoiced.attachedDocument,
  });
  if (invoiced.order.loyaltyOptIn) await issueLoyaltyVoucher(invoiced.order, shop, now);
  return { ok: true, data: invoiced.order };
}
