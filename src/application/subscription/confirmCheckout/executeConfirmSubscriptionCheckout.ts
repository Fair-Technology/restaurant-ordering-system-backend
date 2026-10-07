import { HttpRequest } from '@azure/functions';
import { subscriptionPeriod, subscriptionPriceId } from '../../../infrastructure/stripe/billingEventParsing';
import { ApplicationResult } from '../../_shared/types';
import { executeHandleBillingSubscriptionEvent } from '../handleBillingSubscriptionEvent/executeHandleBillingSubscriptionEvent';
import { executeHandleCheckoutSessionCompleted } from '../handleCheckoutSessionCompleted/executeHandleCheckoutSessionCompleted';
import { GetShopSubscriptionResultDto } from '../getShopSubscription/dtos';
import { loadShopSubscriptionResult } from '../getShopSubscription/executeGetShopSubscription';
import { authorizeBilling, isApplicationError, stripeFromEnv } from '../_shared/billingAccess';

/** Applies a finished Checkout straight away, so the plan changes when the owner returns instead of when the webhook arrives. */
export async function executeConfirmSubscriptionCheckout(
  shopId: string,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetShopSubscriptionResultDto>> {
  if (!shopId) {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }

  try {
    const body = (await httpRequest.json()) as { sessionId?: unknown };
    if (typeof body?.sessionId !== 'string' || !body.sessionId) {
      return { ok: false, code: 'INVALID_INPUT', error: 'sessionId is required' };
    }

    const access = await authorizeBilling(shopId, httpRequest);
    if (!access.ok) return access;

    const stripe = stripeFromEnv();
    if (isApplicationError(stripe)) return stripe;

    const session = await stripe.checkout.sessions.retrieve(body.sessionId, { expand: ['subscription'] });
    if (session.metadata?.shopId !== shopId) {
      return { ok: false, code: 'FORBIDDEN', error: 'This checkout belongs to another restaurant' };
    }
    if (session.mode !== 'subscription' || session.status !== 'complete') {
      return { ok: false, code: 'INVALID_INPUT', error: 'Checkout is not complete' };
    }

    const { planId, billingInterval } = session.metadata;
    const stripeSub = session.subscription;
    const billingSubscriptionId = typeof stripeSub === 'string' ? stripeSub : stripeSub?.id;
    const billingCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    if (!planId || (billingInterval !== 'monthly' && billingInterval !== 'yearly') || !billingSubscriptionId || !billingCustomerId) {
      return { ok: false, code: 'INVALID_INPUT', error: 'Checkout is not complete' };
    }

    await executeHandleCheckoutSessionCompleted({ shopId, planId, billingInterval, billingSubscriptionId, billingCustomerId });
    if (stripeSub && typeof stripeSub !== 'string') {
      // The same fold the webhook does, so the period dates are there at once.
      const period = subscriptionPeriod(stripeSub);
      await executeHandleBillingSubscriptionEvent('subscription.updated', {
        billingSubscriptionId,
        stripeStatus: stripeSub.status,
        periodStart: period.start,
        periodEnd: period.end,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
        priceId: subscriptionPriceId(stripeSub),
      });
    }

    return { ok: true, data: await loadShopSubscriptionResult(shopId) };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to confirm the checkout' };
  }
}
