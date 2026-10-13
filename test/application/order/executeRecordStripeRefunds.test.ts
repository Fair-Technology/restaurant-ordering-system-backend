import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  findOrderByStripePaymentIntentId: vi.fn(),
  findShopById: vi.fn(),
  listPaymentRefunds: vi.fn(),
  logAudit: vi.fn(),
  store: null as any,
}));

vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findOrderByStripePaymentIntentId: m.findOrderByStripePaymentIntentId,
  findOrderWithEtag: (...a: unknown[]) => m.store.findOrderWithEtag(...a),
  replaceOrderIfMatch: (...a: unknown[]) => m.store.replaceOrderIfMatch(...a),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: m.findShopById }));
vi.mock('../../../src/infrastructure/stripe/stripeClient', () => ({ listPaymentRefunds: m.listPaymentRefunds }));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: m.logAudit }));

import { executeRecordStripeRefunds } from '../../../src/application/order/stripeRefunds/executeRecordStripeRefunds';
import type { StripeRefundSummary } from '../../../src/domain/order/externalRefunds';
import { ACCEPTED_CARD_ORDER, CARD_SHOP, PLACED_CARD_ORDER, orderStore } from '../../fixtures/orders';

const now = new Date('2026-10-05T12:05:00Z');
const input = { paymentIntentId: 'pi_1', connectAccountId: 'acct_1', now };
const s = (id: string, amountCents: number, extra: Partial<StripeRefundSummary> = {}): StripeRefundSummary => ({
  id,
  amountCents,
  currency: 'eur',
  status: 'succeeded',
  createdAtIso: '2026-10-05T12:00:00.000Z',
  fromApp: false,
  ...extra,
});
const paid = ACCEPTED_CARD_ORDER;
const adminRefunded = {
  ...paid,
  payment: { ...paid.payment, status: 'partially_refunded' as const },
  refunds: [
    { id: 'r1', amountCents: 300, reason: 'Pizza kalt', at: '2026-10-05T12:00:00.000Z', actor: { type: 'staff' as const, id: 'm1' }, stripeRefundId: 're_1' },
  ],
};
const setup = (order: typeof paid) => {
  m.store = orderStore(order);
  m.findOrderByStripePaymentIntentId.mockResolvedValue(order);
};

beforeEach(() => {
  vi.clearAllMocks();
  m.findShopById.mockResolvedValue(CARD_SHOP);
});

describe('executeRecordStripeRefunds', () => {
  it('records a dashboard refund on a paid order', async () => {
    setup(paid);
    m.listPaymentRefunds.mockResolvedValue([s('re_d1', 300)]);
    await expect(executeRecordStripeRefunds(input)).resolves.toBe('recorded');
    expect(m.store.current.payment.status).toBe('partially_refunded');
    expect(m.store.current.refunds[0]).toEqual({
      id: 'stripe-re_d1',
      amountCents: 300,
      reason: 'Stripe dashboard',
      at: '2026-10-05T12:00:00.000Z',
      actor: { type: 'system' },
      stripeRefundId: 're_d1',
    });
    expect(m.listPaymentRefunds).toHaveBeenCalledWith({ connectAccountId: 'acct_1', paymentIntentId: 'pi_1' });
    expect(m.logAudit).toHaveBeenCalledTimes(1);
    expect(m.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'system',
        actorId: 'stripe',
        action: 'order.refund',
        entityId: 'o1',
        changes: [{ field: 'refundedCents', from: 0, to: 300 }],
      }),
    );
  });

  it('a refund made in admin is not recorded a second time', async () => {
    setup(adminRefunded);
    m.listPaymentRefunds.mockResolvedValue([s('re_1', 300, { fromApp: true })]);
    await expect(executeRecordStripeRefunds(input)).resolves.toBe('nothing_new');
    expect(m.store.current).toBe(adminRefunded);
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it('an admin refund still being written is left to admin', async () => {
    setup(paid);
    m.listPaymentRefunds.mockResolvedValue([s('re_1', 300, { fromApp: true })]);
    await expect(executeRecordStripeRefunds(input)).resolves.toBe('nothing_new');
    expect(m.store.current.refunds).toBeUndefined();
  });

  it('a re-delivered event changes nothing', async () => {
    setup(paid);
    m.listPaymentRefunds.mockResolvedValue([s('re_d1', 300)]);
    await expect(executeRecordStripeRefunds(input)).resolves.toBe('recorded');
    m.findOrderByStripePaymentIntentId.mockResolvedValue(m.store.current);
    await expect(executeRecordStripeRefunds(input)).resolves.toBe('nothing_new');
    expect(m.store.current.refunds).toHaveLength(1);
    expect(m.logAudit).toHaveBeenCalledTimes(1);
  });

  it('a later dashboard refund adds only the new one and completes the refund', async () => {
    setup({
      ...paid,
      payment: { ...paid.payment, status: 'partially_refunded' as const },
      refunds: [
        { id: 'stripe-re_d1', amountCents: 300, reason: 'Stripe dashboard', at: '2026-10-05T12:00:00.000Z', actor: { type: 'system' as const }, stripeRefundId: 're_d1' },
      ],
    });
    m.listPaymentRefunds.mockResolvedValue([
      s('re_d2', 750, { createdAtIso: '2026-10-05T13:00:00.000Z' }),
      s('re_d1', 300),
    ]);
    await expect(executeRecordStripeRefunds(input)).resolves.toBe('recorded');
    expect(m.store.current.refunds.map((r: { id: string }) => r.id)).toEqual(['stripe-re_d1', 'stripe-re_d2']);
    expect(m.store.current.payment.status).toBe('refunded');
  });

  it('ignores payments that are not ours', async () => {
    m.findOrderByStripePaymentIntentId.mockResolvedValue(null);
    await expect(executeRecordStripeRefunds(input)).resolves.toBe('ignored');
    expect(m.listPaymentRefunds).not.toHaveBeenCalled();
  });

  it("ignores an event from another restaurant's account", async () => {
    setup(paid);
    await expect(executeRecordStripeRefunds({ ...input, connectAccountId: 'acct_other' })).resolves.toBe('ignored');
    expect(m.listPaymentRefunds).not.toHaveBeenCalled();
  });

  it('a refund before the payment is recorded as taken is retried by Stripe', async () => {
    setup(PLACED_CARD_ORDER);
    await expect(executeRecordStripeRefunds(input)).rejects.toThrow();
    expect(m.listPaymentRefunds).not.toHaveBeenCalled();
  });

  it('a write that keeps losing races is retried by Stripe', async () => {
    m.store = { findOrderWithEtag: async () => ({ order: paid, etag: 'e' }), replaceOrderIfMatch: async () => 'conflict' };
    m.findOrderByStripePaymentIntentId.mockResolvedValue(paid);
    m.listPaymentRefunds.mockResolvedValue([s('re_d1', 300)]);
    await expect(executeRecordStripeRefunds(input)).rejects.toThrow('Could not record Stripe refunds on o1');
  });

  it('a dashboard refund on a declined order whose money was taken is recorded', async () => {
    setup({ ...paid, state: 'REJECTED' });
    m.listPaymentRefunds.mockResolvedValue([s('re_d1', 1050)]);
    await expect(executeRecordStripeRefunds(input)).resolves.toBe('recorded');
    expect(m.store.current.payment.status).toBe('refunded');
  });
});
