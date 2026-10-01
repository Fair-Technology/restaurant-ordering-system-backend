import { HttpRequest } from '@azure/functions';
import { findSubscriptionByShopId, upsertSubscription } from '../../../infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { findPlanByInternalKey, findPlanById } from '../../../infrastructure/cosmos/plan/CosmosPlanRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction } from '../../_shared/shopAccess';
import { ApplicationResult } from '../../_shared/types';
import { GetShopSubscriptionResultDto } from './dtos';
import { ShopSubscription } from '../../../domain/subscription/ShopSubscription';

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

    let subscription = await findSubscriptionByShopId(shopId);

    // Lazy init for existing shops that pre-date this feature
    if (!subscription) {
      const freePlan = await findPlanByInternalKey('free');
      const now = new Date().toISOString();
      const newSub: ShopSubscription = {
        id: shopId,
        shopId,
        planId: freePlan?.id ?? 'default-free',
        status: 'free',
        billingInterval: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        billingCustomerId: null,
        billingSubscriptionId: null,
        cancelAtPeriodEnd: false,
        planSource: 'default',
        overriddenBy: null,
        overrideReason: null,
        overrideExpiresAt: null,
        createdAt: now,
        updatedAt: now,
      };
      subscription = await upsertSubscription(newSub);
    }

    const plan = await findPlanById(subscription.planId);
    return { ok: true, data: { subscription, plan } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve subscription' };
  }
}
