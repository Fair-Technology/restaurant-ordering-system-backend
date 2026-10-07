import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpRequest } from '@azure/functions';

vi.mock('../../../src/infrastructure/auth/authHelpers', () => ({ getUserIdFromAuth: vi.fn(async () => 'sa-1') }));
vi.mock('../../../src/infrastructure/cosmos/user/CosmosUserRepository', () => ({
  findUserById: vi.fn(async () => ({ systemRole: 'superadmin' })),
}));
vi.mock('../../../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository', () => ({
  findSubscriptionByShopId: vi.fn(),
  upsertSubscription: vi.fn(async (s: unknown) => s),
}));
vi.mock('../../../src/infrastructure/cosmos/plan/CosmosPlanRepository', () => ({
  findPlanById: vi.fn(async () => ({ id: 'plan-max', isDefault: false })),
  findDefaultPlan: vi.fn(async () => ({ id: 'plan-basic', isDefault: true })),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn(async () => undefined) }));

import {
  findSubscriptionByShopId,
  upsertSubscription,
} from '../../../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { executeOverrideShopSubscription } from '../../../src/application/subscription/overrideShopSubscription/executeOverrideShopSubscription';
import { defaultSubscription } from '../../../src/domain/subscription/ShopSubscription';

const http = {} as HttpRequest;
const BASE = defaultSubscription('shop-1', 'plan-basic', 'x');

describe('executeOverrideShopSubscription', () => {
  beforeEach(() => vi.clearAllMocks());

  it('remembers the plan in force before the override', async () => {
    (findSubscriptionByShopId as any).mockResolvedValue({ ...BASE, planId: 'plan-pro', planSource: 'billing' });
    await executeOverrideShopSubscription('shop-1', { planId: 'plan-max', overrideReason: 'trial' }, http);
    expect(upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ planBeforeOverride: 'plan-pro' }));
  });

  it('a second override keeps the original plan', async () => {
    (findSubscriptionByShopId as any).mockResolvedValue({
      ...BASE,
      planId: 'plan-max',
      planSource: 'superadmin_override',
      planBeforeOverride: 'plan-pro',
    });
    await executeOverrideShopSubscription('shop-1', { planId: 'plan-basic', overrideReason: 'trial' }, http);
    expect(upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ planBeforeOverride: 'plan-pro' }));
  });
});
