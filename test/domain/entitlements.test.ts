import { describe, it, expect } from 'vitest';
import { defaultSubscription } from '../../src/domain/subscription/ShopSubscription';
import { effectiveLimits, effectivePlanId, graceEndsAt, limitOf } from '../../src/domain/subscription/entitlements';

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

  describe('billing rules', () => {
    const PRO = { ...BASE, planId: 'plan-pro', status: 'active' as const, planSource: 'billing' as const };

    it('seven days after a failed payment the default plan applies', () => {
      const sub = { ...PRO, status: 'past_due' as const, paymentFailedAt: '2026-09-30T11:00:00Z' };
      expect(effectivePlanId(sub, 'plan-basic', now)).toBe('plan-basic');
    });

    it('within the grace period the paid plan stays', () => {
      const sub = { ...PRO, status: 'past_due' as const, paymentFailedAt: '2026-10-01T12:00:00Z' };
      expect(effectivePlanId(sub, 'plan-basic', now)).toBe('plan-pro');
    });

    it('a scheduled downgrade applies from its date', () => {
      const max = { ...PRO, planId: 'plan-max' };
      const change = { planId: 'plan-pro', billingInterval: 'monthly' as const };
      expect(effectivePlanId({ ...max, scheduledChange: { ...change, effectiveAt: '2026-10-07T00:00:00Z' } }, 'plan-basic', now)).toBe('plan-pro');
      expect(effectivePlanId({ ...max, scheduledChange: { ...change, effectiveAt: '2026-10-08T00:00:00Z' } }, 'plan-basic', now)).toBe('plan-max');
    });

    it('a cancelled plan ends at the period end', () => {
      const sub = { ...PRO, cancelAtPeriodEnd: true, currentPeriodEnd: '2026-10-06T00:00:00Z' };
      expect(effectivePlanId(sub, 'plan-basic', now)).toBe('plan-basic');
    });

    it('an active superadmin override beats a failed payment', () => {
      const sub = {
        ...PRO,
        planId: 'plan-max',
        planSource: 'superadmin_override' as const,
        overrideExpiresAt: null,
        status: 'past_due' as const,
        paymentFailedAt: '2026-09-01T00:00:00Z',
      };
      expect(effectivePlanId(sub, 'plan-basic', now)).toBe('plan-max');
    });

    it('graceEndsAt is seven days after the failure and only while past due', () => {
      expect(graceEndsAt({ status: 'past_due', paymentFailedAt: '2026-10-01T12:00:00.000Z' })).toBe('2026-10-08T12:00:00.000Z');
      expect(graceEndsAt({ status: 'active', paymentFailedAt: '2026-10-01T12:00:00.000Z' })).toBeNull();
    });
  });
});
