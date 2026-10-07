import { describe, it, expect } from 'vitest';
import { defaultSubscription } from '../../src/domain/subscription/ShopSubscription';
import { effectiveLimits, effectivePlanId, limitOf } from '../../src/domain/subscription/entitlements';

const now = new Date('2026-10-07T12:00:00Z');
const BASE = defaultSubscription('s1', 'plan-basic', '2026-10-01T00:00:00.000Z');
const OVERRIDDEN = {
  ...BASE,
  planId: 'plan-max',
  planSource: 'superadmin_override' as const,
  overrideExpiresAt: '2026-10-01T00:00:00.000Z',
  planBeforeOverride: 'plan-pro',
};
const PLAN = { limits: [{ key: 'ORDERS_PER_MONTH', value: 30 }, { key: 'STAFF_ACCOUNTS', value: 5 }] };
const LIMIT_OVERRIDE = {
  limits: [{ key: 'ORDERS_PER_MONTH', value: 100 }],
  reason: 'r',
  expiresAt: null,
  setBy: 'sa',
  setAt: 'x',
};

describe('entitlements', () => {
  it('no subscription uses the default plan', () => {
    expect(effectivePlanId(null, 'plan-basic', now)).toBe('plan-basic');
  });

  it('an expired plan override falls back to the plan before it', () => {
    expect(effectivePlanId(OVERRIDDEN, 'plan-basic', now)).toBe('plan-pro');
  });

  it('an expired override with no earlier plan falls back to the default', () => {
    expect(effectivePlanId({ ...OVERRIDDEN, planBeforeOverride: undefined }, 'plan-basic', now)).toBe('plan-basic');
  });

  it('an override that has not expired stays in force', () => {
    expect(effectivePlanId({ ...OVERRIDDEN, overrideExpiresAt: '2026-10-31T00:00:00.000Z' }, 'plan-basic', now)).toBe('plan-max');
  });

  it('a limit override replaces only its own keys', () => {
    expect(effectiveLimits(PLAN, LIMIT_OVERRIDE, now)).toEqual({ ORDERS_PER_MONTH: 100, STAFF_ACCOUNTS: 5 });
  });

  it('an expired limit override is ignored', () => {
    expect(effectiveLimits(PLAN, { ...LIMIT_OVERRIDE, expiresAt: '2026-10-06T00:00:00.000Z' }, now)).toEqual({
      ORDERS_PER_MONTH: 30,
      STAFF_ACCOUNTS: 5,
    });
  });

  it('limitOf reads -1 and a missing key as no limit', () => {
    expect(limitOf({ limits: { A: -1, Z: 0 } }, 'A')).toBeNull();
    expect(limitOf({ limits: { A: -1, Z: 0 } }, 'B')).toBeNull();
    expect(limitOf({ limits: { A: -1, Z: 0 } }, 'Z')).toBe(0);
  });
});
