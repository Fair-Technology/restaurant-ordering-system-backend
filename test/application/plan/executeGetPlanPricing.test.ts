import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/auth/authHelpers', () => ({
  getPrincipalFromAuth: vi.fn(async () => ({ kind: 'entra', userId: 'u1', issuer: 'customer', roles: [] })),
}));
vi.mock('../../../src/infrastructure/cosmos/plan/CosmosPlanRepository', () => ({
  findPlanById: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/plan/CosmosPlanPricingRepository', () => ({
  findPricingByPlan: vi.fn(),
}));

import { getPrincipalFromAuth } from '../../../src/infrastructure/auth/authHelpers';
import { findPlanById } from '../../../src/infrastructure/cosmos/plan/CosmosPlanRepository';
import { findPricingByPlan } from '../../../src/infrastructure/cosmos/plan/CosmosPlanPricingRepository';
import { executeGetPlanPricing } from '../../../src/application/plan/getPlanPricing/executeGetPlanPricing';

const ROWS = [
  { id: 'a', planId: 'p', currency: 'EUR', isActive: true, billingPriceIdMonthly: 'price_m', billingPriceIdYearly: 'price_y' },
  { id: 'b', planId: 'p', currency: 'USD', isActive: false, billingPriceIdMonthly: 'price_m2', billingPriceIdYearly: 'price_y2' },
];

// The decision comes from the verified identity's platform role, so drive it with a real principal.
const asUser = (systemRole: string) =>
  vi.mocked(getPrincipalFromAuth).mockResolvedValue(
    systemRole === 'superadmin'
      ? ({ kind: 'entra', userId: 'sa', issuer: 'platform', roles: ['Platform.Owner'] } as any)
      : ({ kind: 'entra', userId: 'u1', issuer: 'customer', roles: [] } as any),
  );
const withPlan = (isVisible: boolean) =>
  vi.mocked(findPlanById).mockResolvedValue({ id: 'p', isVisible } as any);

describe('executeGetPlanPricing', () => {
  beforeEach(() => {
    vi.mocked(getPrincipalFromAuth).mockResolvedValue({ kind: 'entra', userId: 'u1', issuer: 'customer', roles: [] } as any);
    vi.mocked(findPricingByPlan).mockResolvedValue(ROWS as any);
  });

  it('superadmin gets all rows with Stripe ids, even on a hidden plan', async () => {
    asUser('superadmin');
    withPlan(false);
    const r = await executeGetPlanPricing('p', {} as any);
    expect(r).toEqual({ ok: true, data: ROWS });
  });

  it('owner gets active rows of a visible plan with Stripe ids nulled', async () => {
    asUser('user');
    withPlan(true);
    const r = await executeGetPlanPricing('p', {} as any);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toHaveLength(1);
      expect(r.data[0].id).toBe('a');
      expect(r.data[0].billingPriceIdMonthly).toBeNull();
      expect(r.data[0].billingPriceIdYearly).toBeNull();
    }
  });

  it('owner on a hidden plan gets NOT_FOUND', async () => {
    asUser('user');
    withPlan(false);
    const r = await executeGetPlanPricing('p', {} as any);
    expect(r).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('unknown plan gets NOT_FOUND', async () => {
    asUser('superadmin');
    vi.mocked(findPlanById).mockResolvedValue(null as any);
    const r = await executeGetPlanPricing('nope', {} as any);
    expect(r).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('unauthenticated gets FORBIDDEN', async () => {
    vi.mocked(getPrincipalFromAuth).mockRejectedValue(new Error('Authentication required'));
    const r = await executeGetPlanPricing('p', {} as any);
    expect(r).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('a ReadOnly platform operator gets the unfiltered read view', async () => {
    vi.mocked(getPrincipalFromAuth).mockResolvedValue({ kind: 'entra', userId: 'ro', issuer: 'platform', roles: ['Platform.ReadOnly'] } as any);
    withPlan(false);
    const res = await executeGetPlanPricing('p', {} as any);
    expect(res.ok && res.data).toHaveLength(2);
  });

  it('a customer token claiming Platform.ReadOnly does not get the operator view', async () => {
    vi.mocked(getPrincipalFromAuth).mockResolvedValue({ kind: 'entra', userId: 'x', issuer: 'customer', roles: ['Platform.ReadOnly'] } as any);
    withPlan(false);
    expect(await executeGetPlanPricing('p', {} as any)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});
