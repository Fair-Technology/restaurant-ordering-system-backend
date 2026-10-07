import { HttpRequest } from '@azure/functions';
import { findSubscriptionByShopId, upsertSubscription } from '../../../infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { findDefaultPlan, findPlanById } from '../../../infrastructure/cosmos/plan/CosmosPlanRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction } from '../../_shared/shopAccess';
import { loadEntitlements } from '../../_shared/entitlements';
import { ApplicationResult } from '../../_shared/types';
import { GetShopSubscriptionResultDto } from './dtos';
import { defaultSubscription } from '../../../domain/subscription/ShopSubscription';
import { FALLBACK_DEFAULT_PLAN_ID } from '../../../domain/subscription/entitlements';

/** The restaurant's subscription (created on first read for restaurants that pre-date billing), its plan and entitlements. */
export async function loadShopSubscriptionResult(shopId: string): Promise<GetShopSubscriptionResultDto> {
  let subscription = await findSubscriptionByShopId(shopId);

  // Lazy init for existing shops that pre-date this feature
  if (!subscription) {
    const defaultPlan = await findDefaultPlan();
    const now = new Date().toISOString();
    const newSub = defaultSubscription(shopId, defaultPlan?.id ?? FALLBACK_DEFAULT_PLAN_ID, now);
    subscription = await upsertSubscription(newSub);
  }

  const plan = await findPlanById(subscription.planId);
  const entitlements = await loadEntitlements(shopId, new Date());
  return { subscription, plan, entitlements };
}

export async function executeGetShopSubscription(
  shopId: string,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetShopSubscriptionResultDto>> {
  if (!shopId) {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }

  try {
    const shop = await findShopById(shopId);
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const access = await authorizeShopAction(httpRequest, shop, 'manage_billing', { allowSuperadmin: true });
    if (!access.ok) return access;

    return { ok: true, data: await loadShopSubscriptionResult(shopId) };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve subscription' };
  }
}
