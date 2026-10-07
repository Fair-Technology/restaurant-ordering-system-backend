import { findSubscriptionByShopId } from '../../infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { findDefaultPlan, findPlanById } from '../../infrastructure/cosmos/plan/CosmosPlanRepository';
import {
  Entitlements,
  FALLBACK_DEFAULT_PLAN_ID,
  effectiveLimits,
  effectivePlanId,
  isLimitOverrideActive,
  isOverrideExpired,
} from '../../domain/subscription/entitlements';

/** What a restaurant is entitled to right now: the plan in force plus any per-restaurant limit override. */
export async function loadEntitlements(shopId: string, now: Date): Promise<Entitlements> {
  const [sub, defaultPlan] = await Promise.all([findSubscriptionByShopId(shopId), findDefaultPlan()]);
  const defaultId = defaultPlan?.id ?? FALLBACK_DEFAULT_PLAN_ID;
  const planId = effectivePlanId(sub, defaultId, now);
  const plan = planId === defaultPlan?.id ? defaultPlan : await findPlanById(planId);
  return {
    planId,
    limits: effectiveLimits(plan, sub?.limitOverride, now),
    limitOverrideActive: isLimitOverrideActive(sub?.limitOverride, now),
    planOverrideExpired: !!sub && isOverrideExpired(sub, now),
  };
}
