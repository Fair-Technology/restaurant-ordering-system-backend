import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository', () => ({
  findSubscriptionByBillingSubscriptionId: vi.fn(),
  upsertSubscription: vi.fn(async (s: unknown) => s),
}));
vi.mock('../../../src/infrastructure/cosmos/plan/CosmosPlanPricingRepository', () => ({
  findPricingByBillingPriceId: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/plan/CosmosPlanRepository', () => ({
  findDefaultPlan: vi.fn(async () => ({ id: 'plan-basic', isDefault: true })),
}));

import {
  findSubscriptionByBillingSubscriptionId,
  upsertSubscription,
} from '../../../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { findPricingByBillingPriceId } from '../../../src/infrastructure/cosmos/plan/CosmosPlanPricingRepository';
import { executeHandleBillingSubscriptionEvent } from '../../../src/application/subscription/handleBillingSubscriptionEvent/executeHandleBillingSubscriptionEvent';
import { defaultSubscription } from '../../../src/domain/subscription/ShopSubscription';

const PRO = { ...defaultSubscription('s1', 'plan-pro', 'x'), status: 'active' as const, planSource: 'billing' as const, billingSubscriptionId: 'sub_1' };

describe('billing event handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('an upgrade webhook changes the plan', async () => {
    (findSubscriptionByBillingSubscriptionId as any).mockResolvedValue(PRO);
    (findPricingByBillingPriceId as any).mockResolvedValue({ planId: 'plan-max', billingPriceIdMonthly: 'price_max_m', billingPriceIdYearly: 'price_max_y' });
    await executeHandleBillingSubscriptionEvent('subscription.updated', {
      billingSubscriptionId: 'sub_1',
      stripeStatus: 'active',
      priceId: 'price_max_m',
      periodStart: '2026-10-01T00:00:00.000Z',
      periodEnd: '2026-11-01T00:00:00.000Z',
    });
    expect(upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 'plan-max', billingInterval: 'monthly', currentPeriodEnd: '2026-11-01T00:00:00.000Z' }),
    );
  });

  it('a yearly price maps to the yearly interval', async () => {
    (findSubscriptionByBillingSubscriptionId as any).mockResolvedValue(PRO);
    (findPricingByBillingPriceId as any).mockResolvedValue({ planId: 'plan-max', billingPriceIdMonthly: 'price_max_m', billingPriceIdYearly: 'price_max_y' });
    await executeHandleBillingSubscriptionEvent('subscription.updated', { billingSubscriptionId: 'sub_1', stripeStatus: 'active', priceId: 'price_max_y' });
    expect(upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ billingInterval: 'yearly' }));
  });

  it('an unknown subscription is ignored with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    (findSubscriptionByBillingSubscriptionId as any).mockResolvedValue(null);
    await executeHandleBillingSubscriptionEvent('invoice.payment_failed', { billingSubscriptionId: 'sub_x' });
    expect(warn).toHaveBeenCalled();
    expect(upsertSubscription).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a failed invoice starts the grace period', async () => {
    (findSubscriptionByBillingSubscriptionId as any).mockResolvedValue(PRO);
    await executeHandleBillingSubscriptionEvent('invoice.payment_failed', { billingSubscriptionId: 'sub_1' });
    expect(upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ status: 'past_due', paymentFailedAt: expect.any(String) }));
  });
});
