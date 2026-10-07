import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository', () => ({
  findSubscriptionsNeedingTimers: vi.fn(),
  upsertSubscription: vi.fn(async (s: unknown) => s),
}));
vi.mock('../../../src/infrastructure/cosmos/plan/CosmosPlanRepository', () => ({
  findDefaultPlan: vi.fn(async () => ({
    id: 'plan-basic',
    name: 'Basic',
    isDefault: true,
    limits: [{ key: 'ORDERS_PER_MONTH', value: 30 }],
  })),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/application/usage/orderLimitWarnings', () => ({ ownerRecipients: vi.fn(async () => ['owner@example.com']) }));
vi.mock('../../../src/infrastructure/email/emailSender', () => ({ sendEmail: vi.fn(async () => undefined) }));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn(async () => undefined) }));

import {
  findSubscriptionsNeedingTimers,
  upsertSubscription,
} from '../../../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { sendEmail } from '../../../src/infrastructure/email/emailSender';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { executeProcessSubscriptionTimers } from '../../../src/application/subscription/timers/executeProcessSubscriptionTimers';
import { defaultSubscription } from '../../../src/domain/subscription/ShopSubscription';
import { buildPaymentGraceEmail } from '../../../src/application/subscription/timers/paymentGraceEmail';
import { CARD_SHOP } from '../../fixtures/orders';

const now = new Date('2026-10-07T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const failing = (failedMsAgo: number, sent: number, shopId = 'shop-1') => ({
  ...defaultSubscription(shopId, 'plan-pro', 'x'),
  status: 'past_due' as const,
  planSource: 'billing' as const,
  paymentFailedAt: ago(failedMsAgo),
  graceWarningsSent: sent,
});

describe('subscription timers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findShopById as any).mockResolvedValue(CARD_SHOP);
  });

  it('the first grace email goes out on the day of the failure', async () => {
    (findSubscriptionsNeedingTimers as any).mockResolvedValue([failing(HOUR, 0)]);
    const res = await executeProcessSubscriptionTimers({ now });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ['owner@example.com'], tag: 'payment_grace_warning' }));
    expect(upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ graceWarningsSent: 1 }));
    expect(res.graceEmails).toBe(1);
  });

  it('day four has sent two emails', async () => {
    (findSubscriptionsNeedingTimers as any).mockResolvedValue([failing(4 * DAY, 1)]);
    await executeProcessSubscriptionTimers({ now });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ graceWarningsSent: 2 }));
  });

  it('no fourth email', async () => {
    (findSubscriptionsNeedingTimers as any).mockResolvedValue([failing(8 * DAY, 3)]);
    await executeProcessSubscriptionTimers({ now });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('a timer that was down catches up on the emails that are due', async () => {
    (findSubscriptionsNeedingTimers as any).mockResolvedValue([failing(6.5 * DAY, 0)]);
    await executeProcessSubscriptionTimers({ now });
    expect(sendEmail).toHaveBeenCalledTimes(3);
  });

  it('a due downgrade is written', async () => {
    (findSubscriptionsNeedingTimers as any).mockResolvedValue([
      {
        ...defaultSubscription('shop-1', 'plan-max', 'x'),
        planSource: 'billing',
        scheduledChange: { planId: 'plan-pro', billingInterval: 'monthly', effectiveAt: ago(HOUR) },
      },
    ]);
    const res = await executeProcessSubscriptionTimers({ now });
    expect(upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ planId: 'plan-pro', scheduledChange: null }));
    expect(res.changesApplied).toBe(1);
  });

  it('a due downgrade does not overwrite an active manual plan', async () => {
    (findSubscriptionsNeedingTimers as any).mockResolvedValue([
      {
        ...defaultSubscription('shop-1', 'plan-max', 'x'),
        planSource: 'superadmin_override',
        overrideExpiresAt: null,
        planBeforeOverride: 'plan-max',
        scheduledChange: { planId: 'plan-pro', billingInterval: 'monthly', effectiveAt: ago(HOUR) },
      },
    ]);
    await executeProcessSubscriptionTimers({ now });
    expect(upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 'plan-max', planBeforeOverride: 'plan-pro', scheduledChange: null }),
    );
  });

  it('an expired override is tidied and audited', async () => {
    (findSubscriptionsNeedingTimers as any).mockResolvedValue([
      {
        ...defaultSubscription('shop-1', 'plan-max', 'x'),
        planSource: 'superadmin_override',
        overrideExpiresAt: ago(HOUR),
        overriddenBy: 'sa-1',
        overrideReason: 'trial',
        planBeforeOverride: 'plan-pro',
      },
    ]);
    const res = await executeProcessSubscriptionTimers({ now });
    expect(upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 'plan-pro', planSource: 'default', overrideExpiresAt: null, planBeforeOverride: null }),
    );
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'subscription.override_expired', actorType: 'system' }));
    expect(res.overridesExpired).toBe(1);
  });

  it('one broken record does not stop the run', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    (findSubscriptionsNeedingTimers as any).mockResolvedValue([failing(HOUR, 0, 'shop-1'), failing(HOUR, 0, 'shop-2')]);
    (upsertSubscription as any).mockRejectedValueOnce(new Error('cosmos down'));
    const res = await executeProcessSubscriptionTimers({ now });
    expect(upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ shopId: 'shop-2', graceWarningsSent: 1 }));
    expect(res.graceEmails).toBe(1);
  });

  it('the grace email names the date, the free plan and that nothing is deleted', () => {
    const mail = buildPaymentGraceEmail({
      shop: { name: 'Ma Pasta', menuLanguages: ['en'], timezone: 'Europe/Berlin' },
      n: 1,
      graceEndsAt: '2026-10-14T12:00:00.000Z',
      defaultPlanName: 'Basic',
      defaultOrderLimit: 30,
      url: 'http://admin/shops/s/subscription',
    });
    expect(mail.subject).toBe('Ma Pasta: Payment failed – please update by 14 Oct 2026');
    expect(mail.text).toContain('moves to Basic (30 orders a month). Nothing is deleted');
    expect(mail.text).toContain('http://admin/shops/s/subscription');
  });
});
