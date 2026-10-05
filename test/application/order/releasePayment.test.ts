import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findOrderWithEtag: vi.fn(),
  replaceOrderIfMatch: vi.fn(),
}));
vi.mock('../../../src/infrastructure/email/emailSender', () => ({
  sendEmail: vi.fn(async () => undefined),
  emailTransportName: () => 'log',
}));
vi.mock('../../../src/infrastructure/stripe/stripeClient', () => ({
  capturePaymentIntent: vi.fn(async () => undefined),
  releaseAuthorization: vi.fn(async () => 'canceled'),
  createRefund: vi.fn(async () => ({ id: 're_1' })),
  isRetryableStripeError: (e: any) => ['StripeConnectionError', 'StripeAPIError', 'StripeRateLimitError'].includes(e?.type),
}));

import { releaseClosedOrderPayment } from '../../../src/application/order/_shared/releasePayment';
import {
  findOrderWithEtag,
  replaceOrderIfMatch,
} from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { sendEmail } from '../../../src/infrastructure/email/emailSender';
import { createRefund, releaseAuthorization } from '../../../src/infrastructure/stripe/stripeClient';
import type { Order } from '../../../src/domain/order/Order';
import { CARD_SHOP, LEGACY_CASH_ORDER, orderStore, PLACED_CARD_ORDER } from '../../fixtures/orders';

const now = new Date('2026-10-05T10:05:00Z');
const REJECTED_ORDER: Order = { ...PLACED_CARD_ORDER, state: 'REJECTED' };

function storeOf(order: Order) {
  const store = orderStore(order);
  (findOrderWithEtag as any).mockImplementation(store.findOrderWithEtag);
  (replaceOrderIfMatch as any).mockImplementation(store.replaceOrderIfMatch);
  return store;
}

describe('releaseClosedOrderPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (releaseAuthorization as any).mockResolvedValue('canceled');
  });

  it('declining releases the hold for free', async () => {
    const store = storeOf(REJECTED_ORDER);
    const res = await releaseClosedOrderPayment('o1', CARD_SHOP, now);
    expect(releaseAuthorization).toHaveBeenCalledWith({
      connectAccountId: 'acct_1',
      paymentIntentId: 'pi_1',
      idempotencyKey: 'release-o1',
    });
    expect(createRefund).not.toHaveBeenCalled();
    expect(store.current.payment.status).toBe('canceled');
    expect(res.outcome).toBe('released');
  });

  it('a payment captured before the decline is refunded instead', async () => {
    (releaseAuthorization as any).mockResolvedValue('already_captured');
    const store = storeOf(REJECTED_ORDER);
    const res = await releaseClosedOrderPayment('o1', CARD_SHOP, now);
    expect(createRefund).toHaveBeenCalledWith({
      connectAccountId: 'acct_1',
      paymentIntentId: 'pi_1',
      amountCents: 1050,
      idempotencyKey: 'auto-refund-o1',
    });
    expect(store.current.payment.status).toBe('refunded');
    expect(store.current.refunds).toEqual([
      expect.objectContaining({ amountCents: 1050, stripeRefundId: 're_1', actor: { type: 'system' } }),
    ]);
    expect(res.outcome).toBe('refunded');
  });

  it('money taken earlier is refunded without trying to cancel', async () => {
    const store = storeOf({ ...REJECTED_ORDER, payment: { ...REJECTED_ORDER.payment, status: 'paid' } });
    await releaseClosedOrderPayment('o1', CARD_SHOP, now);
    expect(releaseAuthorization).not.toHaveBeenCalled();
    expect(createRefund).toHaveBeenCalled();
    expect(store.current.payment.status).toBe('refunded');
  });

  it('a release Stripe refuses is recorded and the restaurant told once', async () => {
    (releaseAuthorization as any).mockRejectedValue(new Error('API down'));
    const store = storeOf(REJECTED_ORDER);
    const res = await releaseClosedOrderPayment('o1', CARD_SHOP, now);
    expect(res.outcome).toBe('failed');
    expect(store.current.payment.status).toBe('authorized');
    expect(store.current.releaseFailure).toEqual({
      at: now.toISOString(),
      message: 'API down',
      notifiedAt: now.toISOString(),
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Zahlung für Bestellung AB3-K7P konnte nicht freigegeben werden' }),
    );

    const later = new Date('2026-10-05T10:20:00Z');
    await releaseClosedOrderPayment('o1', CARD_SHOP, later);
    expect(store.current.releaseFailure?.at).toBe(later.toISOString());
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('a retry that works clears the failure', async () => {
    const store = storeOf({
      ...REJECTED_ORDER,
      releaseFailure: { at: '2026-10-05T10:00:00.000Z', message: 'API down', notifiedAt: '2026-10-05T10:00:00.000Z' },
    });
    const res = await releaseClosedOrderPayment('o1', CARD_SHOP, now);
    expect(res.outcome).toBe('released');
    expect(store.current.releaseFailure).toBeUndefined();
  });

  it('nothing on an old pay-at-collection order', async () => {
    storeOf({ ...LEGACY_CASH_ORDER, state: 'REJECTED' });
    const res = await releaseClosedOrderPayment('o1', CARD_SHOP, now);
    expect(res.outcome).toBe('not_needed');
    expect(releaseAuthorization).not.toHaveBeenCalled();
    expect(createRefund).not.toHaveBeenCalled();
  });

  it('nothing once released', async () => {
    storeOf({ ...REJECTED_ORDER, payment: { ...REJECTED_ORDER.payment, status: 'canceled' } });
    const res = await releaseClosedOrderPayment('o1', CARD_SHOP, now);
    expect(res.outcome).toBe('not_needed');
    expect(releaseAuthorization).not.toHaveBeenCalled();
  });
});
