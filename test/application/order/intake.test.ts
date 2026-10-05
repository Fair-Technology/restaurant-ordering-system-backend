import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({ authorizeShopAction: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findOrderWithEtag: vi.fn(),
  replaceOrderIfMatch: vi.fn(),
  findOrdersByShopIdAndStates: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/invoice/CosmosInvoiceRepository', () => ({
  findInvoiceById: vi.fn(async () => null),
  findInvoiceCounter: vi.fn(async () => null),
  commitInvoice: vi.fn(async () => 'ok'),
}));
vi.mock('../../../src/infrastructure/cosmos/usage/CosmosUsageRepository', () => ({ incrementAcceptedOrders: vi.fn() }));
vi.mock('../../../src/infrastructure/stripe/stripeClient', () => ({
  capturePaymentIntent: vi.fn(async () => undefined),
  releaseAuthorization: vi.fn(async () => 'canceled'),
  createRefund: vi.fn(async () => ({ id: 're_1' })),
  findLiveRefund: vi.fn(async () => null),
  isRetryableStripeError: (e: any) => ['StripeConnectionError', 'StripeAPIError', 'StripeRateLimitError'].includes(e?.type),
}));
vi.mock('../../../src/infrastructure/email/emailSender', () => ({
  sendEmail: vi.fn(async () => undefined),
  emailTransportName: () => 'log',
}));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { executeAcceptOrder } from '../../../src/application/order/intake/executeAcceptOrder';
import { executeCompleteOrder } from '../../../src/application/order/intake/executeCompleteOrder';
import { executeGetOrderQueue } from '../../../src/application/order/intake/executeGetOrderQueue';
import { executeMarkOrderReady } from '../../../src/application/order/intake/executeMarkOrderReady';
import { executeRejectOrder } from '../../../src/application/order/intake/executeRejectOrder';
import {
  findOrderWithEtag,
  findOrdersByShopIdAndStates,
  replaceOrderIfMatch,
} from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { incrementAcceptedOrders } from '../../../src/infrastructure/cosmos/usage/CosmosUsageRepository';
import { sendEmail } from '../../../src/infrastructure/email/emailSender';
import {
  ORDER_CHANGED_ERROR,
  ORDER_NOT_FOUND_ERROR,
  PAYMENT_CAPTURE_FAILED_ERROR,
  PAYMENT_SERVICE_UNAVAILABLE_ERROR,
  PREP_MINUTES_ERROR,
  REJECT_REASON_ERROR,
} from '../../../src/domain/order/orderErrors';
import { commitInvoice } from '../../../src/infrastructure/cosmos/invoice/CosmosInvoiceRepository';
import { capturePaymentIntent, releaseAuthorization } from '../../../src/infrastructure/stripe/stripeClient';
import { CARD_SHOP, orderStore, PLACED_CARD_ORDER } from '../../fixtures/orders';

const http = {} as any;
const now = new Date('2026-10-05T10:05:00Z');
const ids = { shopId: 'shop-1', orderId: 'o1' };
const STAFF_ACCESS = {
  ok: true,
  actor: { actorType: 'staff', actorId: 's1', role: 'staff' },
  permissions: ['view_orders'],
};
const ACCEPTED_ORDER = {
  ...PLACED_CARD_ORDER,
  state: 'ACCEPTED' as const,
  readyAt: '2026-10-05T10:25:00.000Z',
  prepMinutes: 20,
};

function storedOrder(order = PLACED_CARD_ORDER) {
  const store = orderStore(order);
  (findOrderWithEtag as any).mockImplementation(store.findOrderWithEtag);
  (replaceOrderIfMatch as any).mockImplementation(store.replaceOrderIfMatch);
  return store;
}

describe('kitchen intake', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(STAFF_ACCESS);
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    storedOrder();
  });

  it('staff accepts with the default prep time', async () => {
    const store = storedOrder();
    const res = await executeAcceptOrder(ids, http, { now });
    expect(capturePaymentIntent).toHaveBeenCalledWith({
      connectAccountId: 'acct_1',
      paymentIntentId: 'pi_1',
      idempotencyKey: 'capture-o1',
    });
    expect(replaceOrderIfMatch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ state: 'PLACED', captureStartedAt: now.toISOString() }),
      'etag-1',
    );
    expect(store.current).toEqual(
      expect.objectContaining({
        state: 'ACCEPTED',
        readyAt: '2026-10-05T10:25:00.000Z',
        prepMinutes: 20,
        usagePeriodKey: '2026-10',
        invoiceNumber: 'R-2026-00001',
      }),
    );
    expect(store.current.payment.status).toBe('paid');
    expect(store.current.captureStartedAt).toBeUndefined();
    expect(commitInvoice).toHaveBeenCalledTimes(1);
    expect(commitInvoice).toHaveBeenCalledWith(
      expect.anything(),
      null,
      expect.objectContaining({ number: 'R-2026-00001' }),
    );
    const written = (replaceOrderIfMatch as any).mock.calls.find((c: any[]) => c[0].state === 'ACCEPTED')[0];
    expect(written.history.at(-1)).toEqual({
      from: 'PLACED',
      to: 'ACCEPTED',
      at: '2026-10-05T10:05:00.000Z',
      actor: { type: 'staff', id: 's1' },
    });
    expect(incrementAcceptedOrders).toHaveBeenCalledWith('shop-1', '2026-10');
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Ma Pasta: Bestellung AB3-K7P angenommen – abholbereit um 12:25',
        text: expect.stringContaining('Ihre Rechnung R-2026-00001 finden Sie im Anhang.'),
        attachments: [expect.objectContaining({ name: 'Rechnung-R-2026-00001.pdf', contentType: 'application/pdf' })],
      }),
    );
    expect(res.ok && res.data.state).toBe('ACCEPTED');
    expect(res.ok && res.data.documents).toEqual([{ id: 'o1', kind: 'invoice', number: 'R-2026-00001' }]);
  });

  it('a refused capture declines the order and tells everyone', async () => {
    (capturePaymentIntent as any).mockRejectedValueOnce(Object.assign(new Error('declined'), { type: 'StripeCardError' }));
    const store = storedOrder();
    const res = await executeAcceptOrder(ids, http, { now });
    expect(res).toEqual({ ok: false, code: 'CONFLICT', error: PAYMENT_CAPTURE_FAILED_ERROR });
    expect(store.current.state).toBe('REJECTED');
    expect(store.current.history.at(-1)).toEqual(
      expect.objectContaining({ to: 'REJECTED', reason: 'payment_failed', actor: { type: 'system' } }),
    );
    expect(store.current.captureStartedAt).toBeUndefined();
    expect(releaseAuthorization).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'release-o1' }));
    expect(store.current.payment.status).toBe('canceled');
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ tag: 'order_rejected' }));
    expect(incrementAcceptedOrders).not.toHaveBeenCalled();
    expect(commitInvoice).not.toHaveBeenCalled();
  });

  it('a Stripe outage leaves the order waiting', async () => {
    (capturePaymentIntent as any).mockRejectedValueOnce(Object.assign(new Error('down'), { type: 'StripeConnectionError' }));
    const store = storedOrder();
    const res = await executeAcceptOrder(ids, http, { now });
    expect(res).toEqual({ ok: false, code: 'CONFLICT', error: PAYMENT_SERVICE_UNAVAILABLE_ERROR });
    expect(store.current.state).toBe('PLACED');
    expect(store.current.captureStartedAt).toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();

    // Trying again takes the money under a key of its own, not the one that may hold a stored failure.
    await executeAcceptOrder(ids, http, { now });
    expect((capturePaymentIntent as any).mock.calls[1][0].idempotencyKey).toBe('capture-o1-2');
    expect(store.current.state).toBe('ACCEPTED');
  });

  it('cannot accept while another accept is taking the payment', async () => {
    storedOrder({ ...PLACED_CARD_ORDER, captureStartedAt: '2026-10-05T10:04:30.000Z' });
    const res = await executeAcceptOrder(ids, http, { now });
    expect(res).toEqual({ ok: false, code: 'CONFLICT', error: ORDER_CHANGED_ERROR });
    expect(capturePaymentIntent).not.toHaveBeenCalled();
  });

  it('an old claim from a crashed accept does not block', async () => {
    const store = storedOrder({ ...PLACED_CARD_ORDER, captureStartedAt: '2026-10-05T10:00:00.000Z', captureAttempts: 1 });
    await executeAcceptOrder(ids, http, { now });
    expect((capturePaymentIntent as any).mock.calls[0][0].idempotencyKey).toBe('capture-o1-2');
    expect(store.current.state).toBe('ACCEPTED');
  });

  it('accepting still works when the invoice cannot be issued', async () => {
    (commitInvoice as any).mockRejectedValueOnce(new Error('database down'));
    const store = storedOrder();
    const res = await executeAcceptOrder(ids, http, { now });
    expect(res.ok && res.data.state).toBe('ACCEPTED');
    expect(store.current.invoiceNumber).toBeUndefined();
    const mail = (sendEmail as any).mock.calls.find((c: any[]) => c[0].tag === 'order_accepted')[0];
    expect(mail.attachments).toBeUndefined();
  });

  it('accepts with an adjusted prep time', async () => {
    await executeAcceptOrder({ ...ids, prepMinutes: 35 }, http, { now });
    expect((replaceOrderIfMatch as any).mock.calls.at(-1)[0].readyAt).toBe('2026-10-05T10:40:00.000Z');
  });

  it('refuses a prep time out of range', async () => {
    const res = await executeAcceptOrder({ ...ids, prepMinutes: 3 }, http, { now });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: PREP_MINUTES_ERROR });
  });

  it('a second accept on an accepted order conflicts', async () => {
    storedOrder(ACCEPTED_ORDER);
    const res = await executeAcceptOrder(ids, http, { now });
    expect(res).toEqual({ ok: false, code: 'CONFLICT', error: 'Cannot move from ACCEPTED to ACCEPTED' });
    expect(incrementAcceptedOrders).not.toHaveBeenCalled();
  });

  it('a concurrent update conflicts', async () => {
    (replaceOrderIfMatch as any).mockResolvedValue('conflict');
    const res = await executeAcceptOrder(ids, http, { now });
    expect(res).toEqual({ ok: false, code: 'CONFLICT', error: ORDER_CHANGED_ERROR });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(incrementAcceptedOrders).not.toHaveBeenCalled();
  });

  it('an order from another restaurant is not found', async () => {
    storedOrder({ ...PLACED_CARD_ORDER, shopId: 'shop-2' });
    const res = await executeAcceptOrder(ids, http, { now });
    expect(res).toEqual({ ok: false, code: 'NOT_FOUND', error: ORDER_NOT_FOUND_ERROR });
  });

  it('rejects with a reason and tells the customer', async () => {
    const store = storedOrder();
    await executeRejectOrder({ ...ids, reason: 'too_busy', note: 'Ofen kaputt' }, http, { now });
    const written = (replaceOrderIfMatch as any).mock.calls[0][0];
    expect(written.state).toBe('REJECTED');
    expect(written.history.at(-1).reason).toBe('too_busy');
    expect(written.rejectionNote).toBe('Ofen kaputt');
    expect(releaseAuthorization).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'release-o1' }));
    expect(store.current.payment.status).toBe('canceled');
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Ma Pasta: Bestellung AB3-K7P abgelehnt',
        text: expect.stringContaining('Es wurde nichts abgebucht.'),
      }),
    );
  });

  it('cannot decline while another accept is taking the payment', async () => {
    storedOrder({ ...PLACED_CARD_ORDER, captureStartedAt: '2026-10-05T10:04:30.000Z' });
    const res = await executeRejectOrder({ ...ids, reason: 'too_busy' }, http, { now });
    expect(res).toEqual({ ok: false, code: 'CONFLICT', error: ORDER_CHANGED_ERROR });
    expect(replaceOrderIfMatch).not.toHaveBeenCalled();
    expect(releaseAuthorization).not.toHaveBeenCalled();
  });

  it('refuses an unknown reason', async () => {
    const res = await executeRejectOrder({ ...ids, reason: 'meh' as any }, http, { now });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: REJECT_REASON_ERROR });
  });

  it('marks ready', async () => {
    storedOrder(ACCEPTED_ORDER);
    const res = await executeMarkOrderReady(ids, http, { now });
    expect(res.ok && res.data.state).toBe('READY');
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Ma Pasta: Bestellung AB3-K7P ist abholbereit' }),
    );
  });

  it('handing over completes the order and leaves the payment alone', async () => {
    storedOrder({ ...ACCEPTED_ORDER, state: 'READY', payment: { ...PLACED_CARD_ORDER.payment, status: 'paid' } });
    const res = await executeCompleteOrder(ids, http, { now });
    expect(res.ok && res.data.state).toBe('COMPLETED');
    expect(res.ok && res.data.paymentStatus).toBe('paid');
  });

  it('without permission is refused', async () => {
    const refusal = { ok: false, code: 'FORBIDDEN', error: 'Insufficient permissions' };
    (authorizeShopAction as any).mockResolvedValue(refusal);
    expect(await executeAcceptOrder(ids, http, { now })).toEqual(refusal);
    expect(findOrderWithEtag).not.toHaveBeenCalled();
  });

  it('queue lists active orders', async () => {
    (findOrdersByShopIdAndStates as any).mockResolvedValue([PLACED_CARD_ORDER]);
    const res = await executeGetOrderQueue({ shopId: 'shop-1' }, http, { now });
    expect(findOrdersByShopIdAndStates).toHaveBeenCalledWith('shop-1', ['PLACED', 'ACCEPTED', 'READY']);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.orders[0].autoRejectAt).toBe('2026-10-05T10:10:00.000Z');
    expect(res.data.defaultPrepMinutes.collection).toBe(20);
    expect('customerAccessToken' in res.data.orders[0]).toBe(false);
    expect(res.data.timezone).toBe('Europe/Berlin');
    expect(res.data.orders[0]).toMatchObject({
      paymentStatus: 'authorized',
      documents: [],
      customerAddress: null,
      releaseFailure: null,
      refundedCents: 0,
      refunds: [],
      autoAccepted: false,
    });
    expect('paymentMethod' in res.data.orders[0]).toBe(false);
  });
});
