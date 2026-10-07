import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/application/_shared/entitlements', () => ({
  loadEntitlements: vi.fn(async () => ({
    planId: 'plan-basic',
    limits: { ORDERS_PER_MONTH: 30 },
    limitOverrideActive: false,
    planOverrideExpired: false,
  })),
}));
vi.mock('../../../src/infrastructure/cosmos/user/CosmosUserRepository', () => ({
  findUserById: vi.fn(async () => ({ id: 'u1', email: 'owner@mapasta.example', systemRole: 'user' })),
}));
vi.mock('../../../src/infrastructure/email/emailSender', () => ({
  sendEmail: vi.fn(async () => undefined),
  emailTransportName: () => 'log',
}));

import { loadEntitlements } from '../../../src/application/_shared/entitlements';
import { notifyOrderLimitThresholds } from '../../../src/application/usage/orderLimitWarnings';
import { findUserById } from '../../../src/infrastructure/cosmos/user/CosmosUserRepository';
import { sendEmail } from '../../../src/infrastructure/email/emailSender';
import { CARD_SHOP } from '../../fixtures/orders';

const now = new Date('2026-10-07T12:00:00Z');
const usage = (n: number) => ({
  id: 'shop-1',
  shopId: 'shop-1',
  periodKey: '2026-10',
  acceptedOrderCount: n,
  lastReconciled: null,
  createdAt: 'x',
  updatedAt: 'x',
});

describe('notifyOrderLimitThresholds', () => {
  beforeEach(() => vi.clearAllMocks());

  it('the 24th of 30 orders sends the 80 % email', async () => {
    await notifyOrderLimitThresholds(CARD_SHOP, usage(24), now);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['owner@mapasta.example'],
        tag: 'order_limit_warning',
        subject: 'Ma Pasta: 80 % Ihres monatlichen Bestelllimits erreicht',
      }),
    );
  });

  it('the 25th order sends nothing', async () => {
    await notifyOrderLimitThresholds(CARD_SHOP, usage(25), now);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('the 30th order says ordering is paused', async () => {
    await notifyOrderLimitThresholds(CARD_SHOP, usage(30), now);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Ma Pasta: Bestelllimit erreicht – Online-Bestellungen pausiert',
        text: expect.stringContaining('30 von 30'),
      }),
    );
  });

  it('unlimited plans never email', async () => {
    (loadEntitlements as any).mockResolvedValueOnce({ planId: 'p', limits: { ORDERS_PER_MONTH: -1 }, limitOverrideActive: false, planOverrideExpired: false });
    await notifyOrderLimitThresholds(CARD_SHOP, usage(24), now);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('an owner without an email falls back to the Impressum address', async () => {
    (findUserById as any).mockResolvedValueOnce({ id: 'u1', systemRole: 'user' });
    await notifyOrderLimitThresholds(CARD_SHOP, usage(24), now);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ['info@mapasta.example'] }));
  });

  it('a mail failure does not throw', async () => {
    (sendEmail as any).mockRejectedValueOnce(new Error('down'));
    await expect(notifyOrderLimitThresholds(CARD_SHOP, usage(24), now)).resolves.toBeUndefined();
  });
});
