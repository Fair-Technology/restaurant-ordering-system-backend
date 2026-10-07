import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HttpRequest } from '@azure/functions';

vi.mock('../../../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository', () => ({
  findSubscriptionByShopId: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/plan/CosmosPlanRepository', () => ({
  findDefaultPlan: vi.fn(),
  findPlanById: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/usage/CosmosUsageRepository', () => ({
  findUsageByShopId: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
}));
vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
}));

import { findSubscriptionByShopId } from '../../../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { findDefaultPlan } from '../../../src/infrastructure/cosmos/plan/CosmosPlanRepository';
import { findUsageByShopId } from '../../../src/infrastructure/cosmos/usage/CosmosUsageRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { loadOrderLimitStatus } from '../../../src/application/usage/orderLimitStatus';
import { executeGetOrderLimit } from '../../../src/application/usage/getOrderLimit/executeGetOrderLimit';
import { defaultSubscription } from '../../../src/domain/subscription/ShopSubscription';
import { CARD_SHOP } from '../../fixtures/orders';

const BASIC = {
  id: 'plan-basic',
  isDefault: true,
  limits: [{ key: 'ORDERS_PER_MONTH', value: 30 }, { key: 'STAFF_ACCOUNTS', value: 5 }],
};
const http = {} as HttpRequest;
const now = new Date('2026-10-07T12:00:00Z');

describe('order limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    (findDefaultPlan as any).mockResolvedValue(BASIC);
    (findSubscriptionByShopId as any).mockResolvedValue(null);
    (findUsageByShopId as any).mockResolvedValue({ periodKey: '2026-10', acceptedOrderCount: 24 });
    (findShopById as any).mockResolvedValue(CARD_SHOP);
  });
  afterEach(() => vi.useRealTimers());

  it('a restaurant with no subscription is held to the default plan', async () => {
    expect(await loadOrderLimitStatus(CARD_SHOP, now)).toEqual({
      limit: 30,
      acceptedOrderCount: 24,
      warningLevel: 80,
      limitReached: false,
      periodKey: '2026-10',
    });
  });

  it('a limit override changes the stop', async () => {
    (findSubscriptionByShopId as any).mockResolvedValue({
      ...defaultSubscription('shop-1', 'plan-basic', 'x'),
      limitOverride: { limits: [{ key: 'ORDERS_PER_MONTH', value: 24 }], reason: 'r', expiresAt: null, setBy: 'sa', setAt: 'x' },
    });
    expect((await loadOrderLimitStatus(CARD_SHOP, now)).limitReached).toBe(true);
  });

  it('any member may read the order limit', async () => {
    const denied = { ok: false, code: 'FORBIDDEN', error: 'You do not have access to this restaurant' };
    (authorizeShopAction as any).mockResolvedValue(denied);
    expect(await executeGetOrderLimit('shop-1', http)).toEqual(denied);
    expect(authorizeShopAction).toHaveBeenCalledWith(http, CARD_SHOP, null, { allowSuperadmin: true });
  });
});
