import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpRequest } from '@azure/functions';

vi.mock('../../../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository', () => ({
  findSubscriptionByShopId: vi.fn(),
  upsertSubscription: vi.fn(async (s: unknown) => s),
}));
vi.mock('../../../src/infrastructure/cosmos/plan/CosmosPlanRepository', () => ({
  findDefaultPlan: vi.fn(),
  findPlanById: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
}));
vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
}));

import {
  findSubscriptionByShopId,
  upsertSubscription,
} from '../../../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { findDefaultPlan, findPlanById } from '../../../src/infrastructure/cosmos/plan/CosmosPlanRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { executeGetShopSubscription } from '../../../src/application/subscription/getShopSubscription/executeGetShopSubscription';
import { CARD_SHOP } from '../../fixtures/orders';

const BASIC = {
  id: 'plan-basic',
  isDefault: true,
  limits: [{ key: 'ORDERS_PER_MONTH', value: 30 }, { key: 'STAFF_ACCOUNTS', value: 5 }],
};

describe('executeGetShopSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    (authorizeShopAction as any).mockResolvedValue({ ok: true });
    (findDefaultPlan as any).mockResolvedValue(BASIC);
    (findPlanById as any).mockResolvedValue(BASIC);
    (upsertSubscription as any).mockImplementation(async (s: unknown) => s);
  });

  it('a missing subscription starts on the default plan and reports what is in force', async () => {
    (findSubscriptionByShopId as any).mockResolvedValue(null);
    const res = await executeGetShopSubscription('shop-1', {} as HttpRequest);
    expect(upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ planId: 'plan-basic' }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.entitlements.planId).toBe('plan-basic');
      expect(res.data.entitlements.limits.ORDERS_PER_MONTH).toBe(30);
    }
  });
});
