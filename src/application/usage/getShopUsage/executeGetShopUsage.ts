import { HttpRequest } from '@azure/functions';
import { getUserIdFromAuth } from '../../../infrastructure/auth/authHelpers';
import { findUserById } from '../../../infrastructure/cosmos/user/CosmosUserRepository';
import { findUsageByShopId } from '../../../infrastructure/cosmos/usage/CosmosUsageRepository';
import { findOrdersForRejectionStats } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { ApplicationResult } from '../../_shared/types';
import { PLAN_LIMIT_KEYS } from '../../_shared/planLimitKeys';
import { loadEntitlements } from '../../_shared/entitlements';
import { loadOrderLimitStatus } from '../orderLimitStatus';
import { GetShopUsageResultDto } from './dtos';
import { ShopUsage } from '../../../domain/usage/ShopUsage';
import { REJECTION_WINDOW_DAYS, rejectionStats } from '../../../domain/usage/rejectionStats';
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

    const now = new Date();
    const ordersPerMonthLimit = (await loadEntitlements(shopId, now)).limits[PLAN_LIMIT_KEYS.ORDERS_PER_MONTH] ?? null;
    const orderLimit = await loadOrderLimitStatus(shop, now);
    const orders = await findOrdersForRejectionStats(
      shopId,
      new Date(now.getTime() - REJECTION_WINDOW_DAYS * 86_400_000).toISOString(),
    );

    return {
      ok: true,
      data: {
        usage: toShopUsageDto(usage),
        ordersPerMonthLimit,
        orderLimit,
        rejections: rejectionStats(orders, now, orderLimit.warningLevel),
      },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve usage' };
  }
}
