import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HttpRequest } from '@azure/functions';

const stripeMock = vi.hoisted(() => ({
  subscriptions: {
    retrieve: vi.fn(async (..._a: unknown[]) => ({ items: { data: [{ id: 'si_1' }] } })),
    update: vi.fn(async (..._a: unknown[]) => ({})),
  },
  checkout: {
    sessions: {
      create: vi.fn(async (..._a: unknown[]) => ({ url: 'https://checkout.example' })),
      retrieve: vi.fn(),
    },
  },
}));
vi.mock('stripe', () => ({
  default: function () {
    return stripeMock;
  },
}));
vi.mock('../../../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository', () => ({
  findSubscriptionByShopId: vi.fn(),
  upsertSubscription: vi.fn(async (s: unknown) => s),
}));
vi.mock('../../../src/infrastructure/cosmos/plan/CosmosPlanRepository', () => ({
  findPlanById: vi.fn(),
  findDefaultPlan: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/plan/CosmosPlanPricingRepository', () => ({
  findPricingByPlanAndCurrency: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/staff/CosmosStaffAccountRepository', () => ({ listStaffAccounts: vi.fn() }));
vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(async () => ({ ok: true, actor: { actorType: 'owner', actorId: 'u1', role: 'owner' }, permissions: [] })),
  toAuditActor: (a: { actorType: string; actorId: string }) => ({ actorType: a.actorType, actorId: a.actorId }),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn(async () => undefined) }));

import {
  findSubscriptionByShopId,
  upsertSubscription,
} from '../../../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { findDefaultPlan, findPlanById } from '../../../src/infrastructure/cosmos/plan/CosmosPlanRepository';
import { findPricingByPlanAndCurrency } from '../../../src/infrastructure/cosmos/plan/CosmosPlanPricingRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { listStaffAccounts } from '../../../src/infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { executeCreateSubscriptionCheckout } from '../../../src/application/subscription/createSubscriptionCheckout/executeCreateSubscriptionCheckout';
import { executeConfirmSubscriptionCheckout } from '../../../src/application/subscription/confirmCheckout/executeConfirmSubscriptionCheckout';
import { executeCancelScheduledChange } from '../../../src/application/subscription/cancelScheduledChange/executeCancelScheduledChange';
import { defaultSubscription } from '../../../src/domain/subscription/ShopSubscription';
import { UPGRADE_DECLINED_ERROR } from '../../../src/domain/order/orderErrors';
import { CARD_SHOP } from '../../fixtures/orders';

const plan = (id: string, sortOrder: number, staff: number, isDefault = false) => ({
  id,
  isDefault,
  sortOrder,
  limits: [{ key: 'ORDERS_PER_MONTH', value: 30 }, { key: 'STAFF_ACCOUNTS', value: staff }],
});
const PLANS: Record<string, ReturnType<typeof plan>> = {
  'plan-basic': plan('plan-basic', 0, 5, true),
  'plan-pro': plan('plan-pro', 1, 2),
  'plan-max': plan('plan-max', 2, 10),
};
const PRICING = { billingPriceIdMonthly: 'price_m', billingPriceIdYearly: 'price_y' };
const paidOn = (planId: string) => ({
  ...defaultSubscription('shop-1', planId, 'x'),
  status: 'active' as const,
  planSource: 'billing' as const,
  billingInterval: 'monthly' as const,
  billingSubscriptionId: 'sub_1',
  billingCustomerId: 'cus_1',
  currentPeriodEnd: '2026-11-01T00:00:00.000Z',
});
const call = (body: unknown) => executeCreateSubscriptionCheckout('shop-1', { json: async () => body } as unknown as HttpRequest);
const staff = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `st${i}`, isActive: true }));

describe('changing plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    process.env.ADMIN_APP_URL = 'http://admin';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    (findPlanById as any).mockImplementation(async (id: string) => PLANS[id] ?? null);
    (findDefaultPlan as any).mockResolvedValue(PLANS['plan-basic']);
    (findPricingByPlanAndCurrency as any).mockResolvedValue(PRICING);
    (listStaffAccounts as any).mockResolvedValue(staff(1));
    (findSubscriptionByShopId as any).mockResolvedValue(defaultSubscription('shop-1', 'plan-basic', 'x'));
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.ADMIN_APP_URL;
  });

  it('a free restaurant goes to Checkout and comes back with the session id', async () => {
    const res = await call({ planId: 'plan-pro', billingInterval: 'monthly' });
    expect(res).toEqual({ ok: true, data: { kind: 'checkout', url: 'https://checkout.example' } });
    const arg = (stripeMock.checkout.sessions.create.mock.calls[0] as any)[0];
    expect(arg.success_url.endsWith('session_id={CHECKOUT_SESSION_ID}')).toBe(true);
  });

  it('an upgrade is applied at once', async () => {
    (findSubscriptionByShopId as any).mockResolvedValue(paidOn('plan-pro'));
    const res = await call({ planId: 'plan-max', billingInterval: 'monthly' });
    expect(res).toEqual({ ok: true, data: { kind: 'applied', planId: 'plan-max' } });
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
      'sub_1',
      expect.objectContaining({ payment_behavior: 'error_if_incomplete', proration_behavior: 'always_invoice' }),
    );
    expect(upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ planId: 'plan-max', scheduledChange: null }));
  });

  it('a declined upgrade leaves the plan alone', async () => {
    (findSubscriptionByShopId as any).mockResolvedValue(paidOn('plan-pro'));
    stripeMock.subscriptions.update.mockRejectedValueOnce({ type: 'StripeCardError' } as never);
    const res = await call({ planId: 'plan-max', billingInterval: 'monthly' });
    expect(res).toEqual({ ok: false, code: 'CONFLICT', error: UPGRADE_DECLINED_ERROR });
    expect(upsertSubscription).not.toHaveBeenCalled();
  });

  it('a downgrade waits for the period end', async () => {
    (findSubscriptionByShopId as any).mockResolvedValue(paidOn('plan-max'));
    const res = await call({ planId: 'plan-pro', billingInterval: 'monthly' });
    expect(res).toEqual({ ok: true, data: { kind: 'scheduled', planId: 'plan-pro', effectiveAt: '2026-11-01T00:00:00.000Z' } });
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith('sub_1', expect.objectContaining({ proration_behavior: 'none' }));
    expect(upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 'plan-max', scheduledChange: expect.objectContaining({ planId: 'plan-pro' }) }),
    );
  });

  it('a downgrade is blocked while too many staff logins are active', async () => {
    (findSubscriptionByShopId as any).mockResolvedValue(paidOn('plan-max'));
    (listStaffAccounts as any).mockResolvedValue(staff(3));
    const res = await call({ planId: 'plan-pro', billingInterval: 'monthly' });
    expect(res).toEqual({ ok: false, code: 'CONFLICT', error: 'Remove staff logins first: the target plan allows 2' });
    expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
  });

  it('the free plan is refused here and the same plan is refused too', async () => {
    (findSubscriptionByShopId as any).mockResolvedValue(paidOn('plan-pro'));
    expect(await call({ planId: 'plan-basic', billingInterval: 'monthly' })).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'Use cancel to move to the free plan',
    });
    expect(await call({ planId: 'plan-pro', billingInterval: 'monthly' })).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'Already on this plan',
    });
  });

  it('the same plan on the other interval is applied at once', async () => {
    (findSubscriptionByShopId as any).mockResolvedValue(paidOn('plan-pro'));
    const res = await call({ planId: 'plan-pro', billingInterval: 'yearly' });
    expect(res).toEqual({ ok: true, data: { kind: 'applied', planId: 'plan-pro' } });
    expect(upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ billingInterval: 'yearly' }));
  });

  it('confirm refuses another restaurant\'s checkout', async () => {
    stripeMock.checkout.sessions.retrieve.mockResolvedValueOnce({ metadata: { shopId: 'other' } } as never);
    const res = await executeConfirmSubscriptionCheckout('shop-1', { json: async () => ({ sessionId: 'cs_1' }) } as unknown as HttpRequest);
    expect(res).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('confirm refuses a checkout that is not complete', async () => {
    stripeMock.checkout.sessions.retrieve.mockResolvedValueOnce({ metadata: { shopId: 'shop-1' }, mode: 'subscription', status: 'open' } as never);
    const res = await executeConfirmSubscriptionCheckout('shop-1', { json: async () => ({ sessionId: 'cs_1' }) } as unknown as HttpRequest);
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'Checkout is not complete' });
  });

  it('keep current plan puts the old price back and clears the schedule', async () => {
    (findSubscriptionByShopId as any).mockResolvedValue({
      ...paidOn('plan-max'),
      scheduledChange: { planId: 'plan-pro', billingInterval: 'monthly', effectiveAt: '2026-11-01T00:00:00.000Z' },
    });
    await executeCancelScheduledChange('shop-1', {} as HttpRequest);
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
      'sub_1',
      expect.objectContaining({ items: [{ id: 'si_1', price: 'price_m' }], proration_behavior: 'none' }),
    );
    expect(upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ scheduledChange: null }));
  });
});
