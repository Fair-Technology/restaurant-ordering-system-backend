import { deleteCheckoutSession, findCheckoutSessionsWrittenBetween } from '../../../infrastructure/cosmos/order/CosmosCheckoutSessionRepository';
import { findOrderById } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { releaseAuthorization } from '../../../infrastructure/stripe/stripeClient';
import { releaseSlotPlace } from '../_shared/slotPlaces';
import { reconcileCheckoutSession } from './reconcileCheckoutSession';

export const SWEEP_MIN_AGE_MS = 120_000;
export const GIVE_UP_AFTER_MS = 2_700_000; // 45 min

export interface ReconcileCheckoutsResult { checked: number; converted: number; released: number; failed: number }

/** Timer sweep: turns paid-but-orderless checkouts (diner closed the page) into orders; gives up after 45 minutes. */
export async function executeReconcileCheckouts(input: { now: Date }): Promise<ReconcileCheckoutsResult> {
  const { now } = input;
  const nowS = Math.floor(now.getTime() / 1000);
  const result: ReconcileCheckoutsResult = { checked: 0, converted: 0, released: 0, failed: 0 };
  const sessions = await findCheckoutSessionsWrittenBetween(nowS - 3600, Math.floor((now.getTime() - SWEEP_MIN_AGE_MS) / 1000));
  for (const session of sessions) {
    result.checked++;
    try {
      const outcome = await reconcileCheckoutSession({ session, now, source: 'sweep' });
      if (outcome === 'created' || outcome === 'declined_shop_unavailable') result.converted++;
    } catch {
      result.failed++;
      console.error('[checkout-reconcile:error]', session.id);
      const ageMs = session._ts === undefined ? 0 : now.getTime() - session._ts * 1000;
      if (ageMs < GIVE_UP_AFTER_MS) continue;
      try {
        if (await findOrderById(session.id)) { await deleteCheckoutSession(session.id); continue; }
        const shop = await findShopById(session.shopId);
        const connectAccountId = shop?.stripe?.connectAccountId;
        if (!shop || !connectAccountId) continue;
        const released = await releaseAuthorization({ connectAccountId, paymentIntentId: session.stripePaymentIntentId, idempotencyKey: `release-orphan-${session.stripePaymentIntentId}` });
        if (released === 'already_captured') { console.error('[checkout-reconcile:captured-without-order]', session.id); continue; }
        if (session.scheduledFor) await releaseSlotPlace({ shop, order: { id: session.id, scheduledFor: session.scheduledFor }, now });
        await deleteCheckoutSession(session.id);
        result.released++;
        console.warn('[checkout-reconcile:released]', session.id);
      } catch {
        console.error('[checkout-reconcile:give-up-error]', session.id);
      }
    }
  }
  return result;
}
