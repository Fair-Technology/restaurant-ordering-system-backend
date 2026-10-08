import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosCheckoutSessionRepository', () => ({
  findCheckoutSessionById: vi.fn(async () => null),
}));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findOrderById: vi.fn(),
  findOrderWithEtag: vi.fn(),
  replaceOrderIfMatch: vi.fn(),
}));
vi.mock('../../../src/infrastructure/stripe/stripeClient', () => ({
  capturePaymentIntent: vi.fn(async () => undefined),
  releaseAuthorization: vi.fn(async () => 'canceled'),
  createRefund: vi.fn(async () => ({ id: 're_1' })),
  isRetryableStripeError: (e: any) => ['StripeConnectionError', 'StripeAPIError', 'StripeRateLimitError'].includes(e?.type),
}));
vi.mock('../../../src/infrastructure/email/emailSender', () => ({
  sendEmail: vi.fn(async () => undefined),
  emailTransportName: () => 'log',
}));

import { executeCancelCustomerOrder } from '../../../src/application/order/customer/executeCancelCustomerOrder';
import { executeGetCustomerOrder } from '../../../src/application/order/customer/executeGetCustomerOrder';
import { findCheckoutSessionById } from '../../../src/infrastructure/cosmos/order/CosmosCheckoutSessionRepository';
import {
  findOrderById,
  findOrderWithEtag,
  replaceOrderIfMatch,
} from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { sendEmail } from '../../../src/infrastructure/email/emailSender';
import { CANNOT_CANCEL_ERROR, ORDER_NOT_FOUND_ERROR, PAYMENT_CONFIRMING_ERROR } from '../../../src/domain/order/orderErrors';
import { releaseAuthorization } from '../../../src/infrastructure/stripe/stripeClient';
import { CARD_SHOP, DELIVERY_ADDRESS, orderStore, PLACED_CARD_ORDER, PLACED_DELIVERY_ORDER, PLACED_TABLE_ORDER } from '../../fixtures/orders';

const TOKEN = 'T'.repeat(32);
const now = new Date('2026-10-05T10:05:00Z');

function stored(order = PLACED_CARD_ORDER) {
  const store = orderStore(order);
  (findOrderById as any).mockResolvedValue(order);
  (findOrderWithEtag as any).mockImplementation(store.findOrderWithEtag);
  (replaceOrderIfMatch as any).mockImplementation(store.replaceOrderIfMatch);
  return store;
}

describe('customer order page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    stored();
  });

  it('shows the order with the right token', async () => {
    const res = await executeGetCustomerOrder({ orderId: 'o1', token: TOKEN }, { now });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({
      orderRef: 'AB3-K7P',
      shopName: 'Ma Pasta',
      shopSlug: 'mapasta',
      sellerPhone: '069 1234567',
      canCancel: true,
      rejectionReason: null,
      paymentStatus: 'authorized',
      refundedCents: 0,
      documents: [],
    });
  });

  it('says the payment is being confirmed while only the checkout exists', async () => {
    (findOrderById as any).mockResolvedValue(null);
    (findCheckoutSessionById as any).mockResolvedValue({ id: 'o1', customerAccessToken: TOKEN });
    expect(await executeGetCustomerOrder({ orderId: 'o1', token: TOKEN }, { now })).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      error: PAYMENT_CONFIRMING_ERROR,
    });
    // a wrong token learns nothing about the checkout
    expect(await executeGetCustomerOrder({ orderId: 'o1', token: 'x'.repeat(32) }, { now })).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      error: ORDER_NOT_FOUND_ERROR,
    });
  });

  it('a wrong token looks like a missing order', async () => {
    const res = await executeGetCustomerOrder({ orderId: 'o1', token: 'X'.repeat(32) }, { now });
    expect(res).toEqual({ ok: false, code: 'NOT_FOUND', error: 'Order not found' });
  });

  it('an order without a token is never shown', async () => {
    stored({ ...PLACED_CARD_ORDER, customerAccessToken: undefined });
    const res = await executeGetCustomerOrder({ orderId: 'o1', token: '' }, { now });
    expect(res).toEqual({ ok: false, code: 'NOT_FOUND', error: 'Order not found' });
  });

  it('customer cancels before acceptance', async () => {
    const store = stored();
    const res = await executeCancelCustomerOrder({ orderId: 'o1', token: TOKEN }, { now });
    const written = (replaceOrderIfMatch as any).mock.calls[0][0];
    expect(written.state).toBe('CANCELLED');
    expect(releaseAuthorization).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'release-o1' }));
    expect(store.current.payment.status).toBe('canceled');
    expect(written.history.at(-1)).toMatchObject({ actor: { type: 'customer' }, reason: 'customer_cancelled' });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Ma Pasta: Bestellung AB3-K7P storniert',
        text: expect.stringContaining('Es wurde nichts abgebucht.'),
      }),
    );
    expect(res.ok && res.data.canCancel).toBe(false);
  });

  it('cannot cancel once accepted', async () => {
    stored({ ...PLACED_CARD_ORDER, state: 'ACCEPTED', readyAt: '2026-10-05T10:25:00.000Z', prepMinutes: 20 });
    const res = await executeCancelCustomerOrder({ orderId: 'o1', token: TOKEN }, { now });
    expect(res).toEqual({ ok: false, code: 'CONFLICT', error: CANNOT_CANCEL_ERROR });
    expect(replaceOrderIfMatch).not.toHaveBeenCalled();
  });

  it('cannot cancel while the restaurant is taking the payment', async () => {
    stored({ ...PLACED_CARD_ORDER, captureStartedAt: '2026-10-05T10:04:30.000Z' });
    const res = await executeCancelCustomerOrder({ orderId: 'o1', token: TOKEN }, { now });
    expect(res).toEqual({ ok: false, code: 'CONFLICT', error: CANNOT_CANCEL_ERROR });
    expect(replaceOrderIfMatch).not.toHaveBeenCalled();
    expect(releaseAuthorization).not.toHaveBeenCalled();
  });

  it('shows the table to the diner', async () => {
    stored(PLACED_TABLE_ORDER);
    const res = await executeGetCustomerOrder({ orderId: 'o2', token: TOKEN }, { now });
    expect(res.ok && res.data.table).toEqual({ label: '7' });
  });

  it('the diner sees the delivery address, fee and total', async () => {
    stored(PLACED_DELIVERY_ORDER);
    const res = await executeGetCustomerOrder({ orderId: 'o3', token: TOKEN }, { now });
    expect(res.ok && res.data).toMatchObject({
      fulfilmentMode: 'delivery',
      deliveryAddress: DELIVERY_ADDRESS,
      deliveryFeeCents: 250,
      totalCents: 1300,
    });
  });
});
