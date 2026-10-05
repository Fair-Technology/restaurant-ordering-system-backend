import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckoutSession } from '../../../src/domain/order/CheckoutSession';

vi.mock('../../../src/infrastructure/cosmos/order/CosmosCheckoutSessionRepository', () => ({
  findCheckoutSessionById: vi.fn(),
  deleteCheckoutSession: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  createOrder: vi.fn(async (o) => o),
  findOrderById: vi.fn(async () => null),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/application/order/_shared/acceptPlacedOrder', () => ({ acceptPlacedOrder: vi.fn() }));
vi.mock('../../../src/infrastructure/stripe/stripeClient', () => ({ releaseAuthorization: vi.fn(async () => 'canceled') }));
vi.mock('../../../src/infrastructure/email/emailSender', () => ({
  sendEmail: vi.fn(async () => undefined),
  emailTransportName: () => 'log',
}));
vi.mock('../../../src/domain/order/orderRef', () => ({ generateOrderRef: () => 'AB3-K7P' }));

import { executeHandlePaymentAuthorized } from '../../../src/application/order/handlePaymentAuthorized/executeHandlePaymentAuthorized';
import { acceptPlacedOrder } from '../../../src/application/order/_shared/acceptPlacedOrder';
import {
  deleteCheckoutSession,
  findCheckoutSessionById,
} from '../../../src/infrastructure/cosmos/order/CosmosCheckoutSessionRepository';
import { createOrder, findOrderById } from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { sendEmail } from '../../../src/infrastructure/email/emailSender';
import { releaseAuthorization } from '../../../src/infrastructure/stripe/stripeClient';
import { PAYMENT_SERVICE_UNAVAILABLE_ERROR } from '../../../src/domain/order/orderErrors';
import { CARD_SHOP, NOW_OPEN, PLACED_CARD_ORDER } from '../../fixtures/orders';

const session: CheckoutSession = {
  id: 'sess-1',
  shopId: 'shop-1',
  stripePaymentIntentId: 'pi_1',
  items: PLACED_CARD_ORDER.items,
  subtotalCents: 1050,
  currency: 'EUR',
  customerName: 'Anna',
  customerEmail: 'a@example.com',
  customerPhone: '+49 30 1234',
  fulfilmentMode: 'collection',
  customerAccessToken: 'T'.repeat(32),
  orderRef: 'ZZZ-111',
  language: 'de',
  createdAt: '2026-10-05T09:59:00.000Z',
  ttl: 3600,
};
const manualShop = { ...CARD_SHOP, orderSettings: { autoRejectMinutes: 10, alertEmail: null, autoAccept: false } };
const input = { sessionId: 'sess-1', paymentIntentId: 'pi_1', connectAccountId: 'acct_1', now: NOW_OPEN };

describe('executeHandlePaymentAuthorized', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findCheckoutSessionById as any).mockResolvedValue(session);
    (findOrderById as any).mockResolvedValue(null);
    (findShopById as any).mockResolvedValue(manualShop);
    (acceptPlacedOrder as any).mockResolvedValue({ ok: true, data: {} });
  });

  it('creates an order with the money reserved and emails the diner', async () => {
    expect(await executeHandlePaymentAuthorized(input)).toBe('created');
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'sess-1',
        state: 'PLACED',
        orderRef: 'ZZZ-111',
        payment: { method: 'card', status: 'authorized', stripePaymentIntentId: 'pi_1' },
        autoRejectAt: '2026-10-05T10:10:00.000Z',
      }),
    );
    expect(deleteCheckoutSession).toHaveBeenCalledWith('sess-1');
    expect(acceptPlacedOrder).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Ma Pasta: Bestellung ZZZ-111 eingegangen' }));
  });

  it('with auto-accept on, the order is accepted at once', async () => {
    (findShopById as any).mockResolvedValue(CARD_SHOP); // no orderSettings: the default is on
    expect(await executeHandlePaymentAuthorized(input)).toBe('created');
    expect(acceptPlacedOrder).toHaveBeenCalledWith({
      orderId: 'sess-1',
      shop: CARD_SHOP,
      actor: { type: 'system' },
      now: NOW_OPEN,
    });
    expect(sendEmail).not.toHaveBeenCalled(); // the acceptance email is the only one
  });

  it('leaves the order for the timer when the payment service is down', async () => {
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    (acceptPlacedOrder as any).mockResolvedValue({ ok: false, code: 'CONFLICT', error: PAYMENT_SERVICE_UNAVAILABLE_ERROR });
    expect(await executeHandlePaymentAuthorized(input)).toBe('created');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ tag: 'order_received' }));
  });

  it('a repeated webhook does nothing twice', async () => {
    (createOrder as any).mockRejectedValueOnce({ code: 409 });
    expect(await executeHandlePaymentAuthorized(input)).toBe('duplicate');
    expect(deleteCheckoutSession).toHaveBeenCalledWith('sess-1');
    expect(acceptPlacedOrder).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();

    (findCheckoutSessionById as any).mockResolvedValue(null);
    (findOrderById as any).mockResolvedValue(PLACED_CARD_ORDER);
    expect(await executeHandlePaymentAuthorized(input)).toBe('duplicate');
    expect(releaseAuthorization).not.toHaveBeenCalled();
  });

  it('a reservation with no checkout and no order is released', async () => {
    (findCheckoutSessionById as any).mockResolvedValue(null);
    expect(await executeHandlePaymentAuthorized(input)).toBe('released_orphan');
    expect(releaseAuthorization).toHaveBeenCalledWith({
      connectAccountId: 'acct_1',
      paymentIntentId: 'pi_1',
      idempotencyKey: 'release-orphan-pi_1',
    });
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('without the account id an orphan cannot be released and is left alone', async () => {
    (findCheckoutSessionById as any).mockResolvedValue(null);
    expect(await executeHandlePaymentAuthorized({ ...input, connectAccountId: null })).toBe('no_session');
    expect(releaseAuthorization).not.toHaveBeenCalled();
  });

  it('other Cosmos errors bubble so Stripe retries the webhook', async () => {
    (createOrder as any).mockRejectedValueOnce({ code: 500 });
    await expect(executeHandlePaymentAuthorized(input)).rejects.toEqual({ code: 500 });
    expect(deleteCheckoutSession).not.toHaveBeenCalled();
  });
});
