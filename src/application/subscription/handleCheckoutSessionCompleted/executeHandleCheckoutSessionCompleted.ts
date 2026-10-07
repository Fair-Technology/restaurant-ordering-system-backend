import { findSubscriptionByShopId, upsertSubscription } from '../../../infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { findDefaultPlan } from '../../../infrastructure/cosmos/plan/CosmosPlanRepository';
import { defaultSubscription } from '../../../domain/subscription/ShopSubscription';
import { FALLBACK_DEFAULT_PLAN_ID } from '../../../domain/subscription/entitlements';

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

  await upsertSubscription({
    ...subscription,
    planId,
    billingSubscriptionId,
    billingCustomerId,
    billingInterval,
    status: 'active',
    planSource: 'billing',
    updatedAt: now,
  });
}
