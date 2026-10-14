import { accessTokenMatches } from '../../../domain/order/orderIds';
import type { Shop } from '../../../domain/shop/Shop';
import { deleteCheckoutSession, findCheckoutSessionById } from '../../../infrastructure/cosmos/order/CosmosCheckoutSessionRepository';
import { findOrderById } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { releaseAuthorization, retrievePaymentIntentSnapshot } from '../../../infrastructure/stripe/stripeClient';
import { releaseSlotPlace } from '../_shared/slotPlaces';

export type RetireOutcome =
  | 'same_checkout' | 'not_owner' | 'already_ordered' | 'not_scheduled' | 'mismatch' | 'paid' | 'retired' | 'error';

/** Statuses where the diner's money is (being) reserved: the old checkout will become an order, so it is never touched. */
const PAID_OR_PAYING = new Set<string>(['requires_capture', 'succeeded', 'processing']);

/**
 * The diner went back and checked out again: frees the place their earlier, still unpaid checkout held, so their
 * own hold cannot make the time look full. Proof of ownership is that checkout's order-page token. The unpaid
 * payment is cancelled first, so it can never be paid later on a place already given away. Never throws.
 */
export async function retireReplacedCheckout(input: {
  shop: Pick<Shop, 'id' | 'timezone' | 'stripe'>;
  replacesOrderId: string;
  replacesAccessToken: string;
  newSessionId: string;
  now: Date;
}): Promise<RetireOutcome> {
  const { shop, replacesOrderId, replacesAccessToken, newSessionId, now } = input;
  if (replacesOrderId === newSessionId) return 'same_checkout';
  try {
    const old = await findCheckoutSessionById(replacesOrderId);
    if (!old || old.shopId !== shop.id || !accessTokenMatches(old.customerAccessToken, replacesAccessToken)) return 'not_owner';
    if (await findOrderById(old.id)) return 'already_ordered';
    if (!old.scheduledFor) return 'not_scheduled';
    const connectAccountId = shop.stripe?.connectAccountId;
    if (!connectAccountId) return 'mismatch';
    const pi = await retrievePaymentIntentSnapshot({ connectAccountId, paymentIntentId: old.stripePaymentIntentId });
    if (pi.id !== old.stripePaymentIntentId || pi.sessionId !== old.id) return 'mismatch';
    if (PAID_OR_PAYING.has(pi.status)) return 'paid';
    if (pi.status !== 'canceled') {
      const released = await releaseAuthorization({ connectAccountId, paymentIntentId: pi.id, idempotencyKey: `replace-${old.id}` });
      if (released === 'already_captured') return 'paid';
    }
    await releaseSlotPlace({ shop, order: { id: old.id, scheduledFor: old.scheduledFor }, now });
    await deleteCheckoutSession(old.id);
    console.warn('[checkout-replace:retired]', old.id, newSessionId);
    return 'retired';
  } catch {
    console.error('[checkout-replace:error]', replacesOrderId);
    return 'error';
  }
}
