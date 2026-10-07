import { findSubscriptionByShopId, upsertSubscription } from '../../../infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { findDefaultPlan } from '../../../infrastructure/cosmos/plan/CosmosPlanRepository';
import { defaultSubscription } from '../../../domain/subscription/ShopSubscription';
import { FALLBACK_DEFAULT_PLAN_ID, isOverrideActive } from '../../../domain/subscription/entitlements';

export interface HandleCheckoutSessionCompletedInput {
  shopId: string;
  planId: string;
  billingInterval: 'monthly' | 'yearly';
  billingSubscriptionId: string;
  billingCustomerId: string;
}

export async function executeHandleCheckoutSessionCompleted(
  input: HandleCheckoutSessionCompletedInput,
): Promise<void> {
  const { shopId, planId, billingInterval, billingSubscriptionId, billingCustomerId } = input;

  let subscription = await findSubscriptionByShopId(shopId);

  const now = new Date().toISOString();

  if (!subscription) {
    const defaultPlan = await findDefaultPlan();
    subscription = defaultSubscription(shopId, defaultPlan?.id ?? FALLBACK_DEFAULT_PLAN_ID, now);
  }

  // The owner is paying now, so a manual plan from superadmin gives way to the paid one.
  const clearOverride = isOverrideActive(subscription, new Date())
    ? { overriddenBy: null, overrideReason: null, overrideExpiresAt: null, planBeforeOverride: null }
    : {};

  await upsertSubscription({
    ...subscription,
    ...clearOverride,
    planId,
    billingSubscriptionId,
    billingCustomerId,
    billingInterval,
    status: 'active',
    planSource: 'billing',
    scheduledChange: null,
    paymentFailedAt: null,
    graceWarningsSent: 0,
    updatedAt: now,
  });
}
