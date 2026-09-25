import { findSubscriptionByShopId } from '../../infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { findPlanById } from '../../infrastructure/cosmos/plan/CosmosPlanRepository';
import { PlanLimitKey } from './planLimitKeys';

/**
 * Looks up a shop's plan limit for the given key.
 * Returns null when the shop has no subscription, no plan, or the plan has no entry for the key.
 * Returns -1 when the plan marks the key unlimited.
 */
export async function getPlanLimitForShop(shopId: string, key: PlanLimitKey): Promise<number | null> {
  const sub = await findSubscriptionByShopId(shopId);
  if (!sub?.planId) return null;
  const plan = await findPlanById(sub.planId);
  return plan?.limits.find((l) => l.key === key)?.value ?? null;
}
