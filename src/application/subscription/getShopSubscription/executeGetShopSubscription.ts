import { logServiceFailure } from '../../_shared/logServiceFailure';
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

/**
 * The restaurant's subscription, its plan and entitlements.
 *
 * `initIfMissing` (default `true`) controls the lazy init kept for the billing write flows:
 * the document is created by `createShop` and by `confirmCheckout`, `retryPayment` and
 * `cancelScheduledChange`. A read must never create, back-fill or sync a record
 * (docs/specs.md §11), so `executeGetShopSubscription` always passes `false`: every caller
 * gets the derived default plan in memory and nothing is persisted.
 */
export async function loadShopSubscriptionResult(
  shopId: string,
  options: { initIfMissing?: boolean } = {},
): Promise<GetShopSubscriptionResultDto> {
  let subscription = await findSubscriptionByShopId(shopId);

  // Lazy init for existing shops that pre-date this feature
  if (!subscription) {
    const defaultPlan = await findDefaultPlan();
    const derived = defaultSubscription(shopId, defaultPlan?.id ?? FALLBACK_DEFAULT_PLAN_ID, new Date().toISOString());
    subscription = options.initIfMissing === false ? derived : await upsertSubscription(derived);
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

    const access = await authorizeShopAction(httpRequest, shop, 'manage_billing', { allowSuperadmin: true, allowPlatformRead: true });
    if (!access.ok) return access;

    // A read never writes: derive the default plan in memory for every caller and leave the
    // document uncreated - it is created by createShop and by the billing write flows. See
    // docs/specs.md §11.
    return { ok: true, data: await loadShopSubscriptionResult(shopId, { initIfMissing: false }) };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('GetShopSubscription', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve subscription' };
  }
}
