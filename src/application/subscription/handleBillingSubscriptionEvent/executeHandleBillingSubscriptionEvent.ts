import { findSubscriptionByBillingSubscriptionId, upsertSubscription } from '../../../infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { findDefaultPlan } from '../../../infrastructure/cosmos/plan/CosmosPlanRepository';
import { findPricingByBillingPriceId } from '../../../infrastructure/cosmos/plan/CosmosPlanPricingRepository';
import { applyBillingEvent, type BillingEvent } from '../../../domain/subscription/billingEvents';
import { FALLBACK_DEFAULT_PLAN_ID } from '../../../domain/subscription/entitlements';

export type BillingSubscriptionEventType = BillingEvent['kind'];

export interface BillingSubscriptionEventData {
  billingSubscriptionId: string;
  stripeStatus?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  priceId?: string | null; // the Stripe price on the subscription; mapped back to a plan here
}

export async function executeHandleBillingSubscriptionEvent(
  kind: BillingSubscriptionEventType,
  data: BillingSubscriptionEventData,
): Promise<void> {
  const local = await findSubscriptionByBillingSubscriptionId(data.billingSubscriptionId);
  if (!local) {
    console.warn('[billing:warn] no local subscription', kind);
    return;
  }

  let event: BillingEvent;
  if (kind === 'subscription.updated') {
    let mapped: { planId: string; billingInterval: 'monthly' | 'yearly' } | null = null;
    if (data.priceId) {
      const pricing = await findPricingByBillingPriceId(data.priceId);
      if (pricing) {
        mapped = { planId: pricing.planId, billingInterval: pricing.billingPriceIdYearly === data.priceId ? 'yearly' : 'monthly' };
      } else if (data.stripeStatus === 'active') {
        console.warn('[billing:warn] price maps to no plan');
      }
    }
    event = {
      kind,
      stripeStatus: data.stripeStatus ?? null,
      periodStart: data.periodStart ?? null,
      periodEnd: data.periodEnd ?? null,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
      mapped,
    };
  } else {
    event = { kind };
  }

  const defaultPlan = await findDefaultPlan();
  await upsertSubscription(
    applyBillingEvent(local, event, { defaultPlanId: defaultPlan?.id ?? FALLBACK_DEFAULT_PLAN_ID, now: new Date() }),
  );
}
