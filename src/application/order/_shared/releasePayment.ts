import type { Order } from '../../../domain/order/Order';
import { needsPaymentRelease } from '../../../domain/order/payment';
import type { Shop } from '../../../domain/shop/Shop';
import {
  findOrderWithEtag,
  replaceOrderIfMatch,
} from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { createRefund, releaseAuthorization } from '../../../infrastructure/stripe/stripeClient';
import { notifyRestaurantReleaseFailed } from '../notifications/notifyOrder';

export type ReleaseOutcome = 'released' | 'refunded' | 'failed' | 'not_needed';

const WRITE_ATTEMPTS = 3;
const MAX_MESSAGE_CHARS = 300;

function messageOf(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.slice(0, MAX_MESSAGE_CHARS);
}

/** Reads the order, applies `change`, writes it only if unchanged meanwhile (up to 3 tries). */
async function writeOrder(orderId: string, change: (current: Order) => Order): Promise<Order | null> {
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const found = await findOrderWithEtag(orderId);
    if (!found) return null;
    const next = change(found.order);
    if ((await replaceOrderIfMatch(next, found.etag)) === 'ok') return next;
  }
  return null;
}

/**
 * Gives a declined or cancelled order's money back: an unspent card reservation is cancelled for free;
 * money that was already taken is refunded in full. The result (or the failure) is written to the order.
 * A failure is recorded and the restaurant emailed once; the timer retries every 15 minutes. Never throws.
 */
export async function releaseClosedOrderPayment(
  orderId: string,
  shop: Shop,
  now: Date,
): Promise<{ outcome: ReleaseOutcome; order: Order | null }> {
  let order: Order | null = null;
  try {
    const found = await findOrderWithEtag(orderId);
    order = found?.order ?? null;
    if (!order || order.shopId !== shop.id || !needsPaymentRelease(order)) {
      return { outcome: 'not_needed', order };
    }
    const connectAccountId = shop.stripe?.connectAccountId;
    const paymentIntentId = order.payment.stripePaymentIntentId;
    if (!connectAccountId || !paymentIntentId) throw new Error('The restaurant has no Stripe account');

    let reservationOnly = order.payment.status === 'authorized';
    if (reservationOnly) {
      const result = await releaseAuthorization({
        connectAccountId,
        paymentIntentId,
        idempotencyKey: `release-${order.id}`,
      });
      reservationOnly = result === 'canceled';
    }

    let recorded: Order | null;
    if (reservationOnly) {
      recorded = await writeOrder(order.id, (current) => {
        const { releaseFailure: _cleared, ...rest } = current;
        return { ...rest, payment: { ...current.payment, status: 'canceled' }, updatedAt: now.toISOString() };
      });
    } else {
      const refund = await createRefund({
        connectAccountId,
        paymentIntentId,
        amountCents: order.subtotalCents,
        idempotencyKey: `auto-refund-${order.id}`,
      });
      recorded = await writeOrder(order.id, (current) => {
        const { releaseFailure: _cleared, ...rest } = current;
        return {
          ...rest,
          payment: { ...current.payment, status: 'refunded' },
          refunds: [
            ...(current.refunds ?? []),
            {
              id: `auto-refund-${current.id}`,
              amountCents: current.subtotalCents,
              reason: current.state === 'CANCELLED' ? 'order_cancelled' : 'order_declined',
              at: now.toISOString(),
              actor: { type: 'system' },
              stripeRefundId: refund.id,
            },
          ],
          updatedAt: now.toISOString(),
        };
      });
    }
    return { outcome: reservationOnly ? 'released' : 'refunded', order: recorded ?? order };
  } catch (err: unknown) {
    console.error('[release:error]', orderId);
    return recordFailure(orderId, shop, now, messageOf(err), order);
  }
}

/** Remembers that the release failed; the restaurant is emailed the first time only. */
async function recordFailure(
  orderId: string,
  shop: Shop,
  now: Date,
  message: string,
  fallback: Order | null,
): Promise<{ outcome: ReleaseOutcome; order: Order | null }> {
  try {
    let firstTime = false;
    const written = await writeOrder(orderId, (current) => {
      const notifiedAt = current.releaseFailure?.notifiedAt ?? now.toISOString();
      firstTime = !current.releaseFailure?.notifiedAt;
      return {
        ...current,
        releaseFailure: { at: now.toISOString(), message, notifiedAt },
        updatedAt: now.toISOString(),
      };
    });
    // Written before sending: a crash in between loses one email instead of repeating it every retry.
    if (written && firstTime) await notifyRestaurantReleaseFailed(written, shop);
    return { outcome: 'failed', order: written ?? fallback };
  } catch {
    return { outcome: 'failed', order: fallback };
  }
}
