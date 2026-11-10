import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpRequest } from '@azure/functions';

// The gate is mocked here on purpose: what this file pins down is that the
// endpoints actually call it, and honour its answer. The decision itself
// (which identities count as platform staff) is covered by
// test/infrastructure/platformAccess.test.ts.
vi.mock('../../src/infrastructure/auth/superAdminAuthHelpers', () => ({
  verifySuperAdminToken: vi.fn(),
  requirePlatform: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findAllShopsIncludingDeleted: vi.fn(async () => []),
}));
vi.mock('../../src/infrastructure/cosmos/plan/CosmosPlanRepository', () => ({
  findPlanById: vi.fn(async () => ({ id: 'p' })),
}));
vi.mock('../../src/infrastructure/cosmos/plan/CosmosPlanPricingRepository', () => ({
  findPricingByPlan: vi.fn(async () => []),
}));
vi.mock('../../src/infrastructure/cosmos/system/CosmosSystemConfigRepository', () => ({
  upsertSystemConfig: vi.fn(async (c: { maxShopsDefault: number }) => c),
}));

import { requirePlatform, verifySuperAdminToken } from '../../src/infrastructure/auth/superAdminAuthHelpers';
import { executeGetAllShops } from '../../src/application/shop/getAllShops/executeGetAllShops';
import { executeGetPlan } from '../../src/application/plan/getPlan/executeGetPlan';
import { executeUpdateSystemConfig } from '../../src/application/systemConfig/updateSystemConfig/executeUpdateSystemConfig';

const http = {} as HttpRequest;

describe('platform endpoints route through the shared gate', () => {
  beforeEach(() => {
    vi.mocked(verifySuperAdminToken).mockReset();
    vi.mocked(requirePlatform).mockReset();
  });

  it.each([
    ['getAllShops', () => executeGetAllShops({} as never, http)],
    ['getPlan', () => executeGetPlan('p', http)],
  ])('%s is allowed for a platform operator', async (_name, call) => {
    vi.mocked(requirePlatform).mockResolvedValue('staff-1');
    const res = await call();
    expect(res.ok).toBe(true);
  });

  it.each([
    ['getAllShops', () => executeGetAllShops({} as never, http)],
    ['getPlan', () => executeGetPlan('p', http)],
  ])('%s is refused when the gate returns no actor', async (_name, call) => {
    vi.mocked(requirePlatform).mockResolvedValue(null);
    const res = await call();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('FORBIDDEN');
  });

  it('a write endpoint refuses a caller the gate turned down', async () => {
    vi.mocked(verifySuperAdminToken).mockResolvedValue(null);
    // Valid body, so the request reaches the gate rather than the input checks.
    const res = await executeUpdateSystemConfig({ maxShopsDefault: 3 } as never, http);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('FORBIDDEN');
  });

  it('a write endpoint accepts a caller the gate approved', async () => {
    vi.mocked(verifySuperAdminToken).mockResolvedValue('staff-1');
    const res = await executeUpdateSystemConfig({ maxShopsDefault: 3 } as never, http);
    expect(res.ok).toBe(true);
  });

  // The point of the split: reads ask for 'read', writes never do.
  it('read endpoints ask the gate for read level', async () => {
    vi.mocked(requirePlatform).mockResolvedValue('ro-1');
    await executeGetAllShops({} as never, http);
    await executeGetPlan('p', http);
    expect(vi.mocked(requirePlatform).mock.calls.map((c) => c[1])).toEqual(['read', 'read']);
  });

  it('a write endpoint asks for write level and never accepts a read-level pass', async () => {
    vi.mocked(requirePlatform).mockResolvedValue('ro-1'); // would let ReadOnly through if consulted
    vi.mocked(verifySuperAdminToken).mockResolvedValue(null);
    const res = await executeUpdateSystemConfig({ maxShopsDefault: 3 } as never, http);
    expect(res).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(requirePlatform).not.toHaveBeenCalled();
  });
});
