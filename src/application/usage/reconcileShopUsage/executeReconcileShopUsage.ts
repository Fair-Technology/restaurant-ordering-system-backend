import { HttpRequest } from '@azure/functions';
import { getUserIdFromAuth } from '../../../infrastructure/auth/authHelpers';
import { findUserById } from '../../../infrastructure/cosmos/user/CosmosUserRepository';
import { findUsageByShopId, upsertUsage } from '../../../infrastructure/cosmos/usage/CosmosUsageRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { countOrdersInUsagePeriod } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { ApplicationResult } from '../../_shared/types';
import { ReconcileShopUsageResultDto } from './dtos';
import { ShopUsage } from '../../../domain/usage/ShopUsage';
import { periodKeyFor } from '../../../domain/usage/usagePeriod';
import { toShopUsageDto } from '../shopUsageDto';

export async function executeReconcileShopUsage(
  shopId: string,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ReconcileShopUsageResultDto>> {
  if (!shopId) {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }

  try {
    const userId = await getUserIdFromAuth(httpRequest);
    const user = await findUserById(userId);
    if (user?.systemRole !== 'superadmin') {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }

    const shop = await findShopById(shopId);
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const periodKey = periodKeyFor(new Date(), shop.timezone);
    const count = await countOrdersInUsagePeriod(shopId, periodKey);

    const now = new Date().toISOString();
    const existing = await findUsageByShopId(shopId);

    const updated: ShopUsage = {
      id: shopId,
      shopId,
      periodKey,
      acceptedOrderCount: count,
      lastReconciled: now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const result = await upsertUsage(updated);
    return { ok: true, data: { usage: toShopUsageDto(result), reconciledCount: count } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to reconcile usage' };
  }
}
