import { describe, it, expect } from 'vitest';
import { applyBillingEvent, type BillingEvent } from '../../src/domain/subscription/billingEvents';
import { defaultSubscription } from '../../src/domain/subscription/ShopSubscription';

const now = new Date('2026-10-07T12:00:00Z');
const ctx = { defaultPlanId: 'plan-basic', now };
const PRO = {
  ...defaultSubscription('s1', 'plan-pro', 'x'),
  status: 'active' as const,
  planSource: 'billing' as const,
  billingSubscriptionId: 'sub_1',
};
const MAX = { ...PRO, planId: 'plan-max' };
const updated = (over: Partial<Extract<BillingEvent, { kind: 'subscription.updated' }>> = {}): BillingEvent => ({
  kind: 'subscription.updated',
  stripeStatus: 'active',
  periodStart: null,
  periodEnd: null,
  cancelAtPeriodEnd: false,
  mapped: null,
  ...over,
});

describe('applyBillingEvent', () => {
  const pendingSub = {
    ...MAX,
    currentPeriodEnd: '2026-11-20T00:00:00.000Z',
    scheduledChange: { planId: 'plan-pro', billingInterval: 'yearly' as const, effectiveAt: '2026-11-20T00:00:00.000Z' },
  };
  it('a moved period end carries a pending downgrade date with it', () => {
    const next = applyBillingEvent(pendingSub, updated({ periodEnd: '2027-10-20T00:00:00.000Z' }), ctx);
    expect(next.currentPeriodEnd).toBe('2027-10-20T00:00:00.000Z');
    expect(next.scheduledChange?.effectiveAt).toBe('2027-10-20T00:00:00.000Z');
  });
  it('an unmoved period end leaves a pending downgrade alone', () => {
    const next = applyBillingEvent(pendingSub, updated({ periodEnd: '2026-11-20T00:00:00.000Z' }), ctx);
    expect(next.scheduledChange?.effectiveAt).toBe('2026-11-20T00:00:00.000Z');
  });
  it('without a pending downgrade nothing is added', () => {
    const next = applyBillingEvent({ ...MAX, currentPeriodEnd: '2026-11-20T00:00:00.000Z' }, updated({ periodEnd: '2027-10-20T00:00:00.000Z' }), ctx);
    expect(next.scheduledChange ?? null).toBeNull();
  });
  it('a pending downgrade not sitting on the old period end is left where it is', () => {
    const elsewhere = { ...pendingSub, scheduledChange: { ...pendingSub.scheduledChange, effectiveAt: '2026-12-31T00:00:00.000Z' } };
    const next = applyBillingEvent(elsewhere, updated({ periodEnd: '2027-10-20T00:00:00.000Z' }), ctx);
    expect(next.scheduledChange?.effectiveAt).toBe('2026-12-31T00:00:00.000Z');
  });
  it('a renewal at the due date does not push the pending downgrade forward', () => {
    const due = { now: new Date('2026-11-20T00:00:01Z'), defaultPlanId: 'plan-basic' };
    const next = applyBillingEvent(pendingSub, updated({ periodEnd: '2026-12-20T00:00:00.000Z', mapped: { planId: 'plan-pro', billingInterval: 'yearly' } }), due);
    expect(next.planId).toBe('plan-pro');
    expect(next.scheduledChange).toBeNull();
  });

  it('an upgrade event moves the plan', () => {
    const next = applyBillingEvent(PRO, updated({ mapped: { planId: 'plan-max', billingInterval: 'monthly' } }), ctx);
    expect(next.planId).toBe('plan-max');
  });

  it('a pending downgrade keeps the current plan until its date', () => {
    const scheduledChange = { planId: 'plan-pro', billingInterval: 'monthly' as const, effectiveAt: '2026-11-01T00:00:00Z' };
    const next = applyBillingEvent({ ...MAX, scheduledChange }, updated({ mapped: { planId: 'plan-pro', billingInterval: 'monthly' } }), ctx);
    expect(next.planId).toBe('plan-max');
    expect(next.scheduledChange).toEqual(scheduledChange);
  });

  it('the renewal after the date applies the downgrade', () => {
    const scheduledChange = { planId: 'plan-pro', billingInterval: 'monthly' as const, effectiveAt: '2026-10-01T00:00:00Z' };
    const next = applyBillingEvent({ ...MAX, scheduledChange }, updated({ mapped: { planId: 'plan-pro', billingInterval: 'monthly' } }), ctx);
    expect(next.planId).toBe('plan-pro');
    expect(next.scheduledChange).toBeNull();
  });

  it('cancel-at-period-end no longer marks the plan cancelled', () => {
    const next = applyBillingEvent(PRO, updated({ stripeStatus: 'active', cancelAtPeriodEnd: true }), ctx);
    expect(next.status).toBe('active');
    expect(next.cancelAtPeriodEnd).toBe(true);
  });

  it('a failed payment starts grace once', () => {
    const failed: BillingEvent = { kind: 'invoice.payment_failed' };
    const first = applyBillingEvent(PRO, failed, ctx);
    const second = applyBillingEvent(first, failed, { ...ctx, now: new Date('2026-10-08T12:00:00Z') });
    expect(first.paymentFailedAt).toBe('2026-10-07T12:00:00.000Z');
    expect(second.paymentFailedAt).toBe(first.paymentFailedAt);
  });

  it('paying ends grace', () => {
    const failing = { ...PRO, status: 'past_due' as const, paymentFailedAt: '2026-10-05T00:00:00.000Z', graceWarningsSent: 2 };
    const next = applyBillingEvent(failing, { kind: 'invoice.paid' }, ctx);
    expect(next).toMatchObject({ status: 'active', paymentFailedAt: null, graceWarningsSent: 0 });
  });

  it('deletion returns to the default plan', () => {
    const next = applyBillingEvent(PRO, { kind: 'subscription.deleted' }, ctx);
    expect(next).toMatchObject({ planId: 'plan-basic', status: 'expired', billingSubscriptionId: null });
  });

  it('an override survives billing events', () => {
    const overridden = { ...MAX, planSource: 'superadmin_override' as const, overrideExpiresAt: null };
    const next = applyBillingEvent(overridden, updated({ mapped: { planId: 'plan-pro', billingInterval: 'monthly' } }), ctx);
    expect(next).toMatchObject({ planId: 'plan-max', planBeforeOverride: 'plan-pro' });
  });

  it('applying the same event twice changes nothing', () => {
    const events: BillingEvent[] = [
      updated({ mapped: { planId: 'plan-max', billingInterval: 'yearly' }, periodStart: '2026-10-01T00:00:00.000Z', periodEnd: '2026-11-01T00:00:00.000Z' }),
      { kind: 'invoice.payment_failed' },
      { kind: 'invoice.paid' },
      { kind: 'subscription.deleted' },
    ];
    for (const e of events) {
      expect(applyBillingEvent(applyBillingEvent(PRO, e, ctx), e, ctx)).toEqual(applyBillingEvent(PRO, e, ctx));
    }
  });
});
