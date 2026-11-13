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
 * The restaurant's subscription (created on first read for restaurants that pre-date billing), its plan and entitlements.
 *
 * `initIfMissing` (default `true`) controls that lazy init. A platform operator reads with it
 * `false`: creating the document is a write, so a `Platform.ReadOnly` principal - or any
 * platform operator on a route that must not write - gets the derived default without one
 * being persisted. The shop's own owner/staff keep the initialising behaviour.
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

    // A platform operator reads the derived default without creating it. The lazy init is a
    // write, and `allowPlatformRead` admits Platform.ReadOnly - see docs/platform-identity.md.
    const initIfMissing = access.actor.actorType !== 'superadmin';
    return { ok: true, data: await loadShopSubscriptionResult(shopId, { initIfMissing }) };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('GetShopSubscription', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve subscription' };
  }
}
