import { Shop } from '../../domain/shop/Shop';
import { limitOf } from '../../domain/subscription/entitlements';
import { OrderLimitStatus, currentAcceptedCount, orderLimitStatus } from '../../domain/usage/orderLimit';
import { periodKeyFor } from '../../domain/usage/usagePeriod';
import { findUsageByShopId } from '../../infrastructure/cosmos/usage/CosmosUsageRepository';
import { loadEntitlements } from '../_shared/entitlements';
import { PLAN_LIMIT_KEYS } from '../_shared/planLimitKeys';

/** How many orders this restaurant has accepted this month against its limit. */
export async function loadOrderLimitStatus(shop: Pick<Shop, 'id' | 'timezone'>, now: Date): Promise<OrderLimitStatus> {
  const periodKey = periodKeyFor(now, shop.timezone);
  const [e, usage] = await Promise.all([loadEntitlements(shop.id, now), findUsageByShopId(shop.id)]);
  return orderLimitStatus(currentAcceptedCount(usage, periodKey), limitOf(e, PLAN_LIMIT_KEYS.ORDERS_PER_MONTH), periodKey);
}
