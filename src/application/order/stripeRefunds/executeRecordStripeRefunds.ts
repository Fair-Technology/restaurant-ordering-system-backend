import { unrecordedExternalRefunds, withExternalRefunds } from '../../../domain/order/externalRefunds';
import { isCaptured, refundedCents } from '../../../domain/order/payment';
import { findOrderByStripePaymentIntentId } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { listPaymentRefunds } from '../../../infrastructure/stripe/stripeClient';
import { logAudit } from '../../_shared/auditHelpers';
import { transitionOrder } from '../_shared/transitionOrder';

export type StripeRefundSyncOutcome = 'recorded' | 'nothing_new' | 'ignored';

const WRITE_ATTEMPTS = 3;

/**
 * Records refunds made outside our app (the restaurant's Stripe dashboard) on the order, as free amounts.
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

  const listed = await listPaymentRefunds({
    connectAccountId: input.connectAccountId,
    paymentIntentId: input.paymentIntentId,
  });
  const fresh = unrecordedExternalRefunds(order, listed);
  if (fresh.length === 0) return 'nothing_new';

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const moved = await transitionOrder({
      orderId: order.id,
      shopId: shop.id,
      change: (current) => ({ ok: true, order: withExternalRefunds(current, fresh, now.toISOString()) }),
    });
    if (!moved.ok) {
      if (moved.code === 'NOT_FOUND') return 'ignored';
      continue;
    }
    const added = (moved.order.refunds ?? []).length - (moved.previous.refunds ?? []).length;
    if (added === 0) return 'nothing_new';
    await logAudit({
      shopId: shop.id,
      actorType: 'system',
      actorId: 'stripe',
      action: 'order.refund',
      entityType: 'order',
      entityId: moved.order.id,
      entityName: moved.order.orderRef,
      changes: [{ field: 'refundedCents', from: refundedCents(moved.previous), to: refundedCents(moved.order) }],
    });
    return 'recorded';
  }
  throw new Error(`Could not record Stripe refunds on ${order.id}`);
}
