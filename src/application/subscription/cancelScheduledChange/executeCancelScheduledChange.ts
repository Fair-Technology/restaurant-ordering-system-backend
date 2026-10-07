import { HttpRequest } from '@azure/functions';
import { findPricingByPlanAndCurrency } from '../../../infrastructure/cosmos/plan/CosmosPlanPricingRepository';
import {
  findSubscriptionByShopId,
  upsertSubscription,
} from '../../../infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { toAuditActor } from '../../_shared/shopAccess';
import { ApplicationResult } from '../../_shared/types';
import { logAudit } from '../../_shared/auditHelpers';
import { GetShopSubscriptionResultDto } from '../getShopSubscription/dtos';
import { loadShopSubscriptionResult } from '../getShopSubscription/executeGetShopSubscription';
import { authorizeBilling, isApplicationError, stripeFromEnv } from '../_shared/billingAccess';

/** "Keep current plan": puts the Stripe price back to the plan the restaurant is on and drops the scheduled downgrade. */
export async function executeCancelScheduledChange(
  shopId: string,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetShopSubscriptionResultDto>> {
  if (!shopId) {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }

  try {
    const access = await authorizeBilling(shopId, httpRequest);
    if (!access.ok) return access;

    const sub = await findSubscriptionByShopId(shopId);
    if (!sub?.scheduledChange || !sub.billingSubscriptionId) {
      return { ok: false, code: 'NOT_FOUND', error: 'No change scheduled' };
    }

    const pricing = await findPricingByPlanAndCurrency(sub.planId, access.shop.currency ?? '');
    const priceId = sub.billingInterval === 'yearly' ? pricing?.billingPriceIdYearly : pricing?.billingPriceIdMonthly;
    if (!priceId) {
      return { ok: false, code: 'INTERNAL_ERROR', error: 'Billing is not configured for the current plan' };
    }

    const stripe = stripeFromEnv();
    if (isApplicationError(stripe)) return stripe;

    const stripeSubscription = await stripe.subscriptions.retrieve(sub.billingSubscriptionId);
    const itemId = stripeSubscription.items.data[0]?.id;
    if (!itemId) {
      return { ok: false, code: 'INTERNAL_ERROR', error: 'Could not read current subscription' };
    }
    await stripe.subscriptions.update(sub.billingSubscriptionId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: 'none',
    });

    await upsertSubscription({ ...sub, scheduledChange: null, updatedAt: new Date().toISOString() });
    await logAudit({
      ...toAuditActor(access.actor),
      action: 'subscription.change_cancelled',
      entityType: 'subscription',
      entityId: sub.id,
      entityName: `Shop ${shopId}`,
      shopId,
      changes: [{ field: 'scheduledChange.planId', from: sub.scheduledChange.planId, to: null }],
    });

    return { ok: true, data: await loadShopSubscriptionResult(shopId) };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to cancel the scheduled change' };
  }
}
