import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  findPlanById: vi.fn(),
  findDefaultPlan: vi.fn(async () => ({ id: 'plan-basic', isDefault: true })),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn(async () => undefined) }));

import { findUserById } from '../../../src/infrastructure/cosmos/user/CosmosUserRepository';
import {
  findSubscriptionByShopId,
  upsertSubscription,
} from '../../../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { executeSetLimitOverride } from '../../../src/application/subscription/limitOverride/executeSetLimitOverride';
import { executeClearLimitOverride } from '../../../src/application/subscription/limitOverride/executeClearLimitOverride';
import { defaultSubscription } from '../../../src/domain/subscription/ShopSubscription';

const http = {} as HttpRequest;
const ok = { limits: [{ key: 'ORDERS_PER_MONTH', value: 100 }], reason: 'Opening week' };

describe('limit override', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findSubscriptionByShopId as any).mockResolvedValue(defaultSubscription('shop-1', 'plan-basic', 'x'));
  });

  it('only a superadmin may override limits', async () => {
    (findUserById as any).mockResolvedValueOnce({ systemRole: 'user' });
    const res = await executeSetLimitOverride('shop-1', ok, http);
    expect(res).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('rejects an unknown limit key', async () => {
    const res = await executeSetLimitOverride('shop-1', { limits: [{ key: 'FOO', value: 1 }], reason: 'r' }, http);
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'Unknown limit key: FOO' });
  });

  it('rejects a value below -1', async () => {
    const res = await executeSetLimitOverride('shop-1', { limits: [{ key: 'ORDERS_PER_MONTH', value: -2 }], reason: 'r' }, http);
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'Limit value for ORDERS_PER_MONTH must be an integer >= -1' });
  });

  describe('with a fixed clock', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('rejects a past expiry', async () => {
      const res = await executeSetLimitOverride('shop-1', { ...ok, expiresAt: '2026-10-01T00:00:00.000Z' }, http);
      expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'expiresAt must be in the future' });
    });
  });

  it('stores the override and audits each changed key', async () => {
    const res = await executeSetLimitOverride('shop-1', ok, http);
    expect(res.ok).toBe(true);
    expect(upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        limitOverride: expect.objectContaining({
          limits: [{ key: 'ORDERS_PER_MONTH', value: 100 }],
          reason: 'Opening week',
          expiresAt: null,
          setBy: 'sa-1',
        }),
      }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription.limit_override',
        changes: [{ field: 'limit.ORDERS_PER_MONTH', from: null, to: 100 }],
      }),
    );
  });

  it('clearing removes the override', async () => {
    (findSubscriptionByShopId as any).mockResolvedValue({
      ...defaultSubscription('shop-1', 'plan-basic', 'x'),
      limitOverride: { limits: [{ key: 'ORDERS_PER_MONTH', value: 100 }], reason: 'r', expiresAt: null, setBy: 'sa-1', setAt: 'x' },
    });
    const res = await executeClearLimitOverride('shop-1', http);
    expect(res.ok).toBe(true);
    expect(upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ limitOverride: null }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'subscription.limit_override_clear', changes: [] }));
  });

  it('clearing with no override is a 404', async () => {
    const res = await executeClearLimitOverride('shop-1', http);
    expect(res).toEqual({ ok: false, code: 'NOT_FOUND', error: 'No limit override' });
  });
});
