import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HttpRequest } from '@azure/functions';

const stripeMock = vi.hoisted(() => ({
  subscriptions: {
    update: vi.fn(async (..._a: unknown[]) => ({})),
  },
}));
vi.mock('stripe', () => ({
  default: function () {
    return stripeMock;
  },
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository', () => ({
  findSubscriptionByShopId: vi.fn(),
  upsertSubscription: vi.fn(async (s: unknown) => s),
}));
vi.mock('../../../src/infrastructure/cosmos/plan/CosmosPlanRepository', () => ({
  findPlanById: vi.fn(),
  findDefaultPlan: vi.fn(async () => ({ id: 'plan-basic', isDefault: true, limits: [] })),
}));
vi.mock('../../../src/application/subscription/_shared/billingAccess', () => ({
  staffCapIfBlocked: vi.fn(async () => null),
}));
vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(async () => ({ ok: true, actor: { actorType: 'owner', actorId: 'u1', role: 'owner' }, permissions: [] })),
  toAuditActor: (a: { actorType: string; actorId: string }) => ({ actorType: a.actorType, actorId: a.actorId }),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn(async () => undefined) }));

import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import {
  findSubscriptionByShopId,
  upsertSubscription,
} from '../../../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { executeCancelShopSubscription } from '../../../src/application/subscription/cancelShopSubscription/executeCancelShopSubscription';
import { defaultSubscription } from '../../../src/domain/subscription/ShopSubscription';

const http = {} as HttpRequest;
const paid = {
  ...defaultSubscription('shop-1', 'plan-pro', 'x'),
  status: 'active' as const,
  planSource: 'billing' as const,
  billingInterval: 'monthly' as const,
  billingSubscriptionId: 'sub_1',
  billingCustomerId: 'cus_1',
  currentPeriodEnd: '2026-12-01T00:00:00.000Z',
};

describe('cancelling a shop subscription', () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    (findShopById as any).mockResolvedValue({ id: 'shop-1', name: 'Bella Pizza' });
    (findSubscriptionByShopId as any).mockResolvedValue(paid);
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalKey;
  });

  it('schedules the cancellation and audits it under the shop name', async () => {
    const res = await executeCancelShopSubscription('shop-1', http);
    expect(res).toEqual({
      ok: true,
      data: {
        id: paid.id,
        shopId: 'shop-1',
        planId: 'plan-pro',
        status: 'active',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: '2026-12-01T00:00:00.000Z',
      },
    });
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true });
    expect(upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ cancelAtPeriodEnd: true, scheduledChange: null }));
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription.cancelScheduled',
        entityName: 'Bella Pizza',
        shopId: 'shop-1',
        actorType: 'owner',
        actorId: 'u1',
      }),
    );
  });

  it('a missing shop is a 404', async () => {
    (findShopById as any).mockResolvedValue(null);
    const res = await executeCancelShopSubscription('shop-1', http);
    expect(res).toEqual({ ok: false, code: 'NOT_FOUND', error: 'Shop not found' });
    expect(logAudit).not.toHaveBeenCalled();
  });
});
