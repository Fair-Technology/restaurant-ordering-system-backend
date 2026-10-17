import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/usage/CosmosSlotPlacesRepository', () => ({
  findSlotPlacesWithEtag: vi.fn(async () => null),
  createSlotPlaces: vi.fn(async () => 'ok'),
  replaceSlotPlacesIfMatch: vi.fn(async () => 'ok'),
}));
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
  listPaymentRefunds: vi.fn(async () => []),
  isRetryableStripeError: (e: any) => ['StripeConnectionError', 'StripeAPIError', 'StripeRateLimitError'].includes(e?.type),
}));

import { findSlotPlacesWithEtag } from '../../../src/infrastructure/cosmos/usage/CosmosSlotPlacesRepository';
import { dayDoc, installSlotStore } from '../../fixtures/slotPlaces';
import { releaseClosedOrderPayment } from '../../../src/application/order/_shared/releasePayment';
import {
  findOrderWithEtag,
  replaceOrderIfMatch,
} from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { sendEmail } from '../../../src/infrastructure/email/emailSender';
import { createRefund, listPaymentRefunds, releaseAuthorization } from '../../../src/infrastructure/stripe/stripeClient';
import type { Order } from '../../../src/domain/order/Order';
import type { StripeRefundSummary } from '../../../src/domain/order/externalRefunds';
import { CARD_SHOP, FEE_CHARGE, LEGACY_CASH_ORDER, orderStore, PLACED_CARD_ORDER } from '../../fixtures/orders';

const now = new Date('2026-10-05T10:05:00Z');
const REJECTED_ORDER: Order = { ...PLACED_CARD_ORDER, state: 'REJECTED' };
const s = (id: string, amountCents: number, extra: Partial<StripeRefundSummary> = {}): StripeRefundSummary => ({
  id,
  amountCents,
  currency: 'eur',
  status: 'succeeded',
  createdAtIso: '2026-10-05T10:00:00.000Z',
  fromApp: false,
  ...extra,
});
const listed = listPaymentRefunds as unknown as ReturnType<typeof vi.fn>;

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
    listed.mockResolvedValue([]);
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

  it('a declined booking gives its place back', async () => {
    const S = '2026-10-06T16:00:00.000Z';
    storeOf({ ...REJECTED_ORDER, scheduledFor: S });
    const slots = installSlotStore([dayDoc('2026-10-06', [{ orderId: 'o1', slot: S, heldUntil: null }])]);
    const res = await releaseClosedOrderPayment('o1', CARD_SHOP, now); // CARD_SHOP has no limit: freeing does not depend on one
    expect(res.outcome).toBe('released');
    expect(slots.doc('2026-10-06')!.places).toEqual([]);
  });

  it('a place that cannot be freed does not stop the release', async () => {
    storeOf({ ...REJECTED_ORDER, scheduledFor: '2026-10-06T16:00:00.000Z' });
    installSlotStore();
    vi.mocked(findSlotPlacesWithEtag).mockRejectedValueOnce(new Error('down'));
    const res = await releaseClosedOrderPayment('o1', CARD_SHOP, now);
    expect(res.outcome).toBe('released');
    expect(releaseAuthorization).toHaveBeenCalledTimes(1);
  });

  it('a payment captured before the decline is refunded instead', async () => {
    (releaseAuthorization as any).mockResolvedValue('already_captured');
    const store = storeOf(REJECTED_ORDER);
    const res = await releaseClosedOrderPayment('o1', CARD_SHOP, now);
    expect(createRefund).toHaveBeenCalledWith({
      connectAccountId: 'acct_1',
      paymentIntentId: 'pi_1',
      orderId: 'o1',
      amountCents: 1050,
      idempotencyKey: 'auto-refund-o1-0-1050',
    });
    expect(store.current.payment.status).toBe('refunded');
    expect(store.current.refunds).toEqual([
      expect.objectContaining({ id: 'auto-refund-re_1', amountCents: 1050, stripeRefundId: 're_1', actor: { type: 'system' } }),
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
      attempts: 1,
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

  it('a retry after a failure uses new Stripe keys so a stored failure is not replayed', async () => {
    storeOf({
      ...REJECTED_ORDER,
      releaseFailure: { at: '2026-10-05T10:00:00.000Z', message: 'x', notifiedAt: '2026-10-05T10:00:00.000Z', attempts: 2 },
    });
    await releaseClosedOrderPayment('o1', CARD_SHOP, now);
    expect(releaseAuthorization).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'release-o1-2' }));
  });

  it('an earlier try that got through is recorded, not repeated', async () => {
    const failure = { at: '2026-10-05T10:00:00.000Z', message: 'x', notifiedAt: '2026-10-05T10:00:00.000Z', attempts: 1 };
    const store = storeOf({ ...REJECTED_ORDER, payment: { ...REJECTED_ORDER.payment, status: 'paid' }, releaseFailure: failure });
    listed.mockResolvedValue([s('re_earlier', 1050, { fromApp: true })]);
    const res = await releaseClosedOrderPayment('o1', CARD_SHOP, now);
    expect(createRefund).not.toHaveBeenCalled();
    expect(store.current.refunds).toEqual([
      expect.objectContaining({ id: 'auto-refund-re_earlier', stripeRefundId: 're_earlier', amountCents: 1050 }),
    ]);
    expect(store.current.payment.status).toBe('refunded');
    expect(res.outcome).toBe('refunded');
  });

  it('a retry after a failure uses its own key', async () => {
    const failure = { at: '2026-10-05T10:00:00.000Z', message: 'x', notifiedAt: '2026-10-05T10:00:00.000Z', attempts: 1 };
    storeOf({ ...REJECTED_ORDER, payment: { ...REJECTED_ORDER.payment, status: 'paid' }, releaseFailure: failure });
    await releaseClosedOrderPayment('o1', CARD_SHOP, now);
    expect(createRefund).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'auto-refund-o1-0-1050-1' }));
  });

  it("the first refund try uses a key naming Stripe's count and the amount", async () => {
    storeOf({ ...REJECTED_ORDER, payment: { ...REJECTED_ORDER.payment, status: 'paid' } });
    await releaseClosedOrderPayment('o1', CARD_SHOP, now);
    expect(createRefund).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'auto-refund-o1-0-1050' }));
  });

  it('a partly refunded declined order gets the rest back', async () => {
    const store = storeOf({
      ...REJECTED_ORDER,
      payment: { ...REJECTED_ORDER.payment, status: 'partially_refunded' },
      refunds: [
        { id: 'stripe-re_d1', amountCents: 300, reason: 'Stripe dashboard', at: '2026-10-05T10:00:00.000Z', actor: { type: 'system' }, stripeRefundId: 're_d1' },
      ],
    });
    listed.mockResolvedValue([s('re_d1', 300)]);
    const res = await releaseClosedOrderPayment('o1', CARD_SHOP, now);
    expect(createRefund).toHaveBeenCalledWith({
      connectAccountId: 'acct_1',
      paymentIntentId: 'pi_1',
      orderId: 'o1',
      amountCents: 750,
      idempotencyKey: 'auto-refund-o1-1-750',
    });
    expect(store.current.refunds!.map((r) => r.id)).toEqual(['stripe-re_d1', 'auto-refund-re_1']);
    expect(store.current.payment.status).toBe('refunded');
    expect(res.outcome).toBe('refunded');
  });

  it('a dashboard refund not yet recorded is counted, not refunded twice', async () => {
    const store = storeOf({ ...REJECTED_ORDER, payment: { ...REJECTED_ORDER.payment, status: 'paid' } });
    listed.mockResolvedValue([s('re_d1', 300)]);
    await releaseClosedOrderPayment('o1', CARD_SHOP, now);
    expect(createRefund).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 750 }));
    expect(store.current.refunds!.map((r) => r.id)).toEqual(['stripe-re_d1', 'auto-refund-re_1']);
    expect(store.current.refunds![0].reason).toBe('Stripe dashboard');
  });

  it('nothing is refunded when the dashboard already gave everything back', async () => {
    const store = storeOf({ ...REJECTED_ORDER, payment: { ...REJECTED_ORDER.payment, status: 'paid' } });
    listed.mockResolvedValue([s('re_d1', 1050)]);
    await releaseClosedOrderPayment('o1', CARD_SHOP, now);
    expect(createRefund).not.toHaveBeenCalled();
    expect(store.current.refunds!.map((r) => r.id)).toEqual(['stripe-re_d1']);
    expect(store.current.payment.status).toBe('refunded');
  });

  it('a failed earlier refund does not count', async () => {
    storeOf({ ...REJECTED_ORDER, payment: { ...REJECTED_ORDER.payment, status: 'paid' } });
    listed.mockResolvedValue([s('re_f', 1050, { status: 'failed', fromApp: true })]);
    await releaseClosedOrderPayment('o1', CARD_SHOP, now);
    expect(createRefund).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 1050, idempotencyKey: 'auto-refund-o1-1-1050' }),
    );
  });

  it('no automatic retry once Stripe failed our refund', async () => {
    storeOf({
      ...REJECTED_ORDER,
      payment: { ...REJECTED_ORDER.payment, status: 'paid' },
      refunds: [
        { id: 'auto-refund-re_a', amountCents: 1050, reason: 'order_declined', at: 'x', actor: { type: 'system' }, stripeRefundId: 're_a' },
        { id: 'reversal-re_a', amountCents: -1050, reason: 'stripe_refund_failed', at: 'x', actor: { type: 'system' }, stripeRefundId: 're_a', reversesIndex: 0 },
      ],
    });
    const res = await releaseClosedOrderPayment('o1', CARD_SHOP, now);
    expect(res.outcome).toBe('not_needed');
    expect(listed).not.toHaveBeenCalled();
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

  it('a captured delivery order is refunded in full, fee included', async () => {
    (releaseAuthorization as any).mockResolvedValue('already_captured');
    const store = storeOf({ ...REJECTED_ORDER, fulfilmentMode: 'delivery', charges: [FEE_CHARGE], totalCents: 1300 });
    await releaseClosedOrderPayment('o1', CARD_SHOP, now);
    expect(createRefund).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 1300 }));
    expect(store.current.refunds![0].amountCents).toBe(1300);
  });
});
