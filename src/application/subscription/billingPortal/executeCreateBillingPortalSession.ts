import { HttpRequest } from '@azure/functions';
import { findSubscriptionByShopId } from '../../../infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { ApplicationResult } from '../../_shared/types';
import { adminSubscriptionUrl, authorizeBilling, isApplicationError, stripeFromEnv } from '../_shared/billingAccess';

/** A link to Stripe's customer portal, where the owner updates their card and sees invoices. */
export async function executeCreateBillingPortalSession(
  shopId: string,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<{ url: string }>> {
  if (!shopId) {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }

  try {
    const access = await authorizeBilling(shopId, httpRequest);
    if (!access.ok) return access;

    const sub = await findSubscriptionByShopId(shopId);
    if (!sub?.billingCustomerId) {
      return { ok: false, code: 'INVALID_INPUT', error: 'No billing account yet' };
    }

    const stripe = stripeFromEnv();
    if (isApplicationError(stripe)) return stripe;
    const returnUrl = adminSubscriptionUrl(shopId);
    if (isApplicationError(returnUrl)) return returnUrl;

    const session = await stripe.billingPortal.sessions.create({ customer: sub.billingCustomerId, return_url: returnUrl });
    return { ok: true, data: { url: session.url } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to open the billing portal' };
  }
}
