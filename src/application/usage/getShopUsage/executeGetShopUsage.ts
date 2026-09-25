import { HttpRequest } from '@azure/functions';
import { getUserIdFromAuth } from '../../../infrastructure/auth/authHelpers';
import { findUserById } from '../../../infrastructure/cosmos/user/CosmosUserRepository';
import { findUsageByShopId } from '../../../infrastructure/cosmos/usage/CosmosUsageRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { ApplicationResult } from '../../_shared/types';
import { PLAN_LIMIT_KEYS } from '../../_shared/planLimitKeys';
import { getPlanLimitForShop } from '../../_shared/planLimits';
import { GetShopUsageResultDto } from './dtos';
import { ShopUsage } from '../../../domain/usage/ShopUsage';
import { periodKeyFor } from '../../../domain/usage/usagePeriod';
import { toShopUsageDto } from '../shopUsageDto';

export async function executeGetShopUsage(
  shopId: string,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetShopUsageResultDto>> {
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

    const currentPeriodKey = periodKeyFor(new Date(), shop.timezone);
    const existing = await findUsageByShopId(shopId);

    const usage: ShopUsage =
      existing && existing.periodKey === currentPeriodKey
        ? existing
        : {
            id: shopId,
            shopId,
            periodKey: currentPeriodKey,
            acceptedOrderCount: 0,
            lastReconciled: existing?.lastReconciled ?? null,
            createdAt: existing?.createdAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

    const ordersPerMonthLimit = await getPlanLimitForShop(shopId, PLAN_LIMIT_KEYS.ORDERS_PER_MONTH);

    return { ok: true, data: { usage: toShopUsageDto(usage), ordersPerMonthLimit } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve usage' };
  }
}
