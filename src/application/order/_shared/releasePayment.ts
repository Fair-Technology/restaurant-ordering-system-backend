import { chargedCents, type Order } from '../../../domain/order/Order';
import { needsPaymentRelease } from '../../../domain/order/payment';
import type { Shop } from '../../../domain/shop/Shop';
import {
  findOrderWithEtag,
  replaceOrderIfMatch,
} from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { createRefund, findLiveRefund, releaseAuthorization } from '../../../infrastructure/stripe/stripeClient';
import { releaseSlotPlace } from './slotPlaces';
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
 * Also frees the order's place in its quarter hour.
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
    // A closed order's place goes back first; this never throws, so the money is always released.
    if (order && order.shopId === shop.id && (order.state === 'REJECTED' || order.state === 'CANCELLED')) {
      await releaseSlotPlace({ shop, order, now });
    }
    if (!order || order.shopId !== shop.id || !needsPaymentRelease(order)) {
      return { outcome: 'not_needed', order };
    }
    const connectAccountId = shop.stripe?.connectAccountId;
    const paymentIntentId = order.payment.stripePaymentIntentId;
    if (!connectAccountId || !paymentIntentId) throw new Error('The restaurant has no Stripe account');

    // Stripe replays the stored answer for a repeated key, a failure included, so a retry after a
    // recorded failure uses a new key.
    const attempts = order.releaseFailure?.attempts ?? (order.releaseFailure ? 1 : 0);
    const keySuffix = attempts > 0 ? `-${attempts}` : '';

    let reservationOnly = order.payment.status === 'authorized';
    if (reservationOnly) {
      const result = await releaseAuthorization({
        connectAccountId,
        paymentIntentId,
        idempotencyKey: `release-${order.id}${keySuffix}`,
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
      // A new key could refund twice if an earlier try got through, so Stripe is asked first.
      const refund =
        (attempts > 0 ? await findLiveRefund({ connectAccountId, paymentIntentId }) : null) ??
        (await createRefund({
          connectAccountId,
          paymentIntentId,
          amountCents: chargedCents(order),
          idempotencyKey: `auto-refund-${order.id}${keySuffix}`,
        }));
      recorded = await writeOrder(order.id, (current) => {
        const { releaseFailure: _cleared, ...rest } = current;
        return {
          ...rest,
          payment: { ...current.payment, status: 'refunded' },
          refunds: [
            ...(current.refunds ?? []),
            {
              id: `auto-refund-${current.id}`,
              amountCents: chargedCents(current),
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
      const attempts = (current.releaseFailure?.attempts ?? (current.releaseFailure ? 1 : 0)) + 1;
      return {
        ...current,
        releaseFailure: { at: now.toISOString(), message, notifiedAt, attempts },
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
