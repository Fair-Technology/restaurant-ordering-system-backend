import { HttpRequest } from '@azure/functions';
import { getUserIdFromAuth } from '../../../infrastructure/auth/authHelpers';
import {
  findShopById,
  updateShop,
} from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { findSubscriptionByShopId } from '../../../infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { findPlanById } from '../../../infrastructure/cosmos/plan/CosmosPlanRepository';
import { findProductsByShopId } from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { checkIsOwner } from '../../_shared/permissions';
import { ApplicationResult } from '../../_shared/types';
import { logAudit } from '../../_shared/auditHelpers';
import { ReactivateShopResultDto } from './dtos';

export async function executeReactivateShop(
  shopId: string,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ReactivateShopResultDto>> {
  if (!shopId) {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }

  try {
    const userId = await getUserIdFromAuth(httpRequest);

    const shop = await findShopById(shopId);
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const ownerError = checkIsOwner(shop, userId);
    if (ownerError) return ownerError;

    if (!shop.isDeactivatedDueToLimits) {
      return { ok: false, code: 'INVALID_INPUT', error: 'Shop is not deactivated due to plan limits' };
    }

    const subscription = await findSubscriptionByShopId(shopId);
    const plan = subscription ? await findPlanById(subscription.planId) : null;
    const productLimit = plan?.limits.find((l) => l.key === 'product_limit')?.value ?? -1;

    if (productLimit > 0) {
      const products = await findProductsByShopId(shopId);
      const activeCount = products.filter((p) => p.isAvailable).length;
      if (activeCount > productLimit) {
        return {
          ok: false,
          code: 'INVALID_INPUT',
          error: `Active product count (${activeCount}) exceeds the free plan limit (${productLimit}). Deactivate products or upgrade.`,
        };
      }
    }

    const now = new Date().toISOString();
    await updateShop({ ...shop, isDeactivatedDueToLimits: false, updatedAt: now });

    await logAudit({
      actorType: 'owner',
      actorId: userId,
      action: 'shop.reactivated',
      entityType: 'shop',
      entityId: shopId,
      entityName: `Shop ${shopId}`,
      shopId,
      changes: [],
    });

    return { ok: true, data: { id: shopId, isDeactivatedDueToLimits: false } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to reactivate shop' };
  }
}
