import type { Order } from '../../../domain/order/Order';
import { isLiveStripeRefund, withStripeRefundSync, type StripeRefundSummary } from '../../../domain/order/externalRefunds';
import { isCaptured, refundedCents } from '../../../domain/order/payment';
import { findOrderByStripePaymentIntentId } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { listPaymentRefunds } from '../../../infrastructure/stripe/stripeClient';
import { logAudit } from '../../_shared/auditHelpers';
import { notifyRestaurantRefundFailed } from '../notifications/notifyOrder';
import { transitionOrder } from '../_shared/transitionOrder';

export type StripeRefundSyncOutcome = 'recorded' | 'nothing_new' | 'ignored';

const WRITE_ATTEMPTS = 3;
const SYNC_ROUNDS = 3;
const APP_WRITE_GRACE_MS = 60 * 60_000;
const UNCHANGED = 'unchanged';

/**
 * Records refunds made outside our app (the restaurant's Stripe dashboard) on the order, as free amounts,
 * and reverses refunds Stripe later reports failed or cancelled (emailing the restaurant). Lists Stripe again
 * after each write (up to 3 rounds) so a status change that raced the write is caught.
 * The correction invoice and email come from the every-minute order timer.
 * Throws when Stripe should retry: order not captured yet, or the write kept losing races
 * (and whatever the Stripe list call throws).
 */
export async function executeRecordStripeRefunds(input: {
  paymentIntentId: string;
  connectAccountId: string | null;
  now?: Date;
}): Promise<StripeRefundSyncOutcome> {
  const now = input.now ?? new Date();
  const order = await findOrderByStripePaymentIntentId(input.paymentIntentId);
  if (!order) return 'ignored';
  const shop = await findShopById(order.shopId);
  if (!shop || !input.connectAccountId || shop.stripe?.connectAccountId !== input.connectAccountId) {
    console.warn('[stripe-refunds] ignored', input.paymentIntentId);
    return 'ignored';
  }
  if (!isCaptured(order)) throw new Error(`Refund on ${order.id} before its payment was recorded as taken`);

  let current: Order = order;
  let changed = false;
  let listed: StripeRefundSummary[] = [];
  for (let round = 0; round < SYNC_ROUNDS; round++) {
    listed = await listPaymentRefunds({
      connectAccountId: input.connectAccountId,
      paymentIntentId: input.paymentIntentId,
    });
    let moved: { order: Order; previous: Order } | null = null;
    let unchanged = false;
    for (let attempt = 0; attempt < WRITE_ATTEMPTS && !moved && !unchanged; attempt++) {
      const res = await transitionOrder({
        orderId: order.id,
        shopId: shop.id,
        change: (x) => {
          const next = withStripeRefundSync(x, listed, now.toISOString());
          return next === x ? { ok: false, error: UNCHANGED } : { ok: true, order: next };
        },
      });
      if (res.ok) moved = { order: res.order, previous: res.previous };
      else if (res.code === 'NOT_FOUND') return 'ignored';
      else if (res.error === UNCHANGED) unchanged = true;
    }
    if (!moved) {
      // Every attempt lost the write race: let Stripe retry the event.
      if (!unchanged) throw new Error(`Could not record Stripe refunds on ${order.id}`);
      break;
    }
    changed = true;
    current = moved.order;
    await logAudit({
      shopId: shop.id,
      actorType: 'system',
      actorId: 'stripe',
      action: 'order.refund',
      entityType: 'order',
      entityId: current.id,
      entityName: current.orderRef,
      changes: [{ field: 'refundedCents', from: refundedCents(moved.previous), to: refundedCents(current) }],
    });
    const all = current.refunds ?? [];
    for (let i = (moved.previous.refunds ?? []).length; i < all.length; i++) {
      if (all[i].reversesIndex !== undefined) await notifyRestaurantRefundFailed({ ...current, refunds: all.slice(0, i + 1) }, shop);
    }
  }
  // Our own refund that Stripe reports failed while the app has not recorded it yet: the app's write is
  // probably still in flight, so let Stripe retry the event a little later.
  const recorded = new Set((current.refunds ?? []).map((r) => r.stripeRefundId));
  if (
    listed.some(
      (r) =>
        r.fromApp &&
        !isLiveStripeRefund(r) &&
        !recorded.has(r.id) &&
        now.getTime() - Date.parse(r.createdAtIso) < APP_WRITE_GRACE_MS,
    )
  ) {
    throw new Error(`Refund on ${current.id} not recorded by the app yet`);
  }
  return changed ? 'recorded' : 'nothing_new';
}
