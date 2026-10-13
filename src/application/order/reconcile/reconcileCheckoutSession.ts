import type { CheckoutSession } from '../../../domain/order/CheckoutSession';
import { deleteCheckoutSession } from '../../../infrastructure/cosmos/order/CosmosCheckoutSessionRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { retrievePaymentIntentSnapshot } from '../../../infrastructure/stripe/stripeClient';
import { executeHandlePaymentAuthorized, type PaymentAuthorizedOutcome } from '../handlePaymentAuthorized/executeHandlePaymentAuthorized';

export const RECONCILE_GRACE_MS = 15_000;
export const RECONCILE_MAX_AGE_MS = 3_600_000;

export type ReconcileOutcome =
  | PaymentAuthorizedOutcome
  | 'not_paid' | 'too_fresh' | 'stale' | 'canceled' | 'mismatch' | 'no_account';

/**
 * Asks Stripe whether a checkout was paid and, if so, runs the same order-building code the webhook runs.
 * Safe to race the webhook: the order id is the checkout id, so the database refuses a second order.
 * Throws on Stripe/Cosmos errors; callers catch.
 */
export async function reconcileCheckoutSession(input: { session: CheckoutSession; now: Date; source: 'order_page' | 'sweep' }): Promise<ReconcileOutcome> {
  const { session, now } = input;
  const ageMs = session._ts === undefined ? 0 : now.getTime() - session._ts * 1000;
  if (ageMs > RECONCILE_MAX_AGE_MS) return 'stale';
  const shop = await findShopById(session.shopId);
  const connectAccountId = shop?.stripe?.connectAccountId;
  if (!connectAccountId) return 'no_account';
  const pi = await retrievePaymentIntentSnapshot({ connectAccountId, paymentIntentId: session.stripePaymentIntentId });
  const expected = session.totalCents ?? session.subtotalCents;
  if (pi.id !== session.stripePaymentIntentId || pi.sessionId !== session.id || pi.amountCents !== expected || pi.currency !== session.currency.toLowerCase()) {
    console.error('[checkout-reconcile:mismatch]', session.id, pi.id);
    return 'mismatch';
  }
  if (pi.status === 'canceled') { await deleteCheckoutSession(session.id); return 'canceled'; }
  if (pi.status !== 'requires_capture' && pi.status !== 'succeeded') return 'not_paid';
  if (pi.authorizedAtMs !== null && now.getTime() - pi.authorizedAtMs < RECONCILE_GRACE_MS) return 'too_fresh';
  const outcome = await executeHandlePaymentAuthorized({ sessionId: session.id, paymentIntentId: pi.id, connectAccountId, now });
  if (outcome === 'created' || outcome === 'declined_shop_unavailable') console.warn('[checkout-reconcile:created]', session.id, input.source, outcome);
  return outcome;
}
