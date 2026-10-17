import type { Order, OrderRefund } from './Order';
import { endIfFullyRefunded } from './orderLifecycle';
import { paymentStatusAfterRefund, paymentStatusOfRefunds } from './payment';

export const STRIPE_DASHBOARD_REFUND_REASON = 'Stripe dashboard';

/** One refund as Stripe lists it, reduced to what we need. */
export interface StripeRefundSummary {
  id: string; // Stripe refund id, e.g. 're_...'
  amountCents: number; // Stripe `amount`
  currency: string; // lowercase, as Stripe sends it, e.g. 'eur'
  status: string | null; // 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'canceled'
  createdAtIso: string; // new Date(created * 1000).toISOString()
  fromApp: boolean; // metadata.source === APP_REFUND_SOURCE
}

export type RefundReversalStatus = 'failed' | 'canceled';

/** Stripe has not failed or cancelled this refund, so it still counts as money going back. */
export function isLiveStripeRefund(r: Pick<StripeRefundSummary, 'status'>): boolean {
  return r.status !== 'failed' && r.status !== 'canceled';
}

/** A refund made outside our app (Stripe dashboard) that the order should record. */
export interface ExternalRefund {
  stripeRefundId: string;
  amountCents: number;
  at: string; // ISO, Stripe's creation time
}

/** Live, same-currency, non-app refunds the order does not record yet; oldest first (ties: id ascending). */
export function unrecordedExternalRefunds(
  order: Pick<Order, 'refunds' | 'currency'>,
  stripeRefunds: ReadonlyArray<StripeRefundSummary>,
): ExternalRefund[] {
  const known = new Set((order.refunds ?? []).map((r) => r.stripeRefundId));
  const currency = order.currency.toLowerCase();
  return stripeRefunds
    .filter(
      (r) =>
        !r.fromApp &&
        !known.has(r.id) &&
        isLiveStripeRefund(r) &&
        r.amountCents > 0 &&
        r.currency.toLowerCase() === currency,
    )
    .sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso) || a.id.localeCompare(b.id))
    .map((r) => ({ stripeRefundId: r.id, amountCents: r.amountCents, at: r.createdAtIso }));
}

/**
 * Appends each refund not already on `order` (by stripeRefundId) as a free-amount refund and recomputes
 * payment.status. Returns `order` itself (same reference) when nothing was appended.
 */
export function withExternalRefunds(order: Order, refunds: ReadonlyArray<ExternalRefund>, nowIso: string): Order {
  const existing = order.refunds ?? [];
  const known = new Set(existing.map((r) => r.stripeRefundId));
  const added: OrderRefund[] = refunds
    .filter((r) => !known.has(r.stripeRefundId))
    .map((r) => ({
      id: `stripe-${r.stripeRefundId}`,
      amountCents: r.amountCents,
      reason: STRIPE_DASHBOARD_REFUND_REASON,
      at: r.at,
      actor: { type: 'system' },
      stripeRefundId: r.stripeRefundId,
    }));
  if (added.length === 0) return order;
  const addedCents = added.reduce((sum, r) => sum + r.amountCents, 0);
  return endIfFullyRefunded(
    {
      ...order,
      payment: { ...order.payment, status: paymentStatusAfterRefund(order, addedCents) },
      refunds: [...existing, ...added],
      updatedAt: nowIso,
    },
    nowIso,
    { type: 'system' },
  );
}

/** Recorded, non-reversal, not-yet-reversed refunds that Stripe now lists as failed/canceled, in index order. */
export function refundsToReverse(
  order: Pick<Order, 'refunds'>,
  stripeRefunds: ReadonlyArray<StripeRefundSummary>,
): Array<{ index: number; status: RefundReversalStatus }> {
  const refunds = order.refunds ?? [];
  const voided = new Set(refunds.flatMap((r) => (r.reversesIndex !== undefined ? [r.reversesIndex] : [])));
  const statusOf = new Map(stripeRefunds.map((r) => [r.id, r.status]));
  return refunds.flatMap((r, index) => {
    if (r.reversesIndex !== undefined || voided.has(index) || r.amountCents <= 0) return [];
    const st = statusOf.get(r.stripeRefundId);
    return st === 'failed' || st === 'canceled' ? [{ index, status: st }] : [];
  });
}

/**
 * withExternalRefunds, then appends one reversal per refund Stripe now reports failed/canceled.
 * Returns `order` itself (same reference) when nothing changes.
 */
export function withStripeRefundSync(order: Order, stripeRefunds: ReadonlyArray<StripeRefundSummary>, nowIso: string): Order {
  const next = withExternalRefunds(order, unrecordedExternalRefunds(order, stripeRefunds), nowIso);
  const hits = refundsToReverse(next, stripeRefunds);
  if (hits.length === 0) return next;
  const existing = next.refunds ?? [];
  const added: OrderRefund[] = hits.map(({ index, status }) => ({
    id: `reversal-${existing[index].stripeRefundId}`,
    amountCents: -existing[index].amountCents,
    reason: `stripe_refund_${status}`,
    at: nowIso,
    actor: { type: 'system' },
    stripeRefundId: existing[index].stripeRefundId,
    reversesIndex: index,
  }));
  const refunds = [...existing, ...added];
  return {
    ...next,
    refunds,
    payment: { ...next.payment, status: paymentStatusOfRefunds({ ...next, refunds }) },
    updatedAt: nowIso,
  };
}
