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
vi.mock('../../../src/infrastructure/cosmos/usage/CosmosSlotPlacesRepository', () => ({
  findSlotPlacesWithEtag: vi.fn(async () => null),
  createSlotPlaces: vi.fn(async () => 'ok'),
  replaceSlotPlacesIfMatch: vi.fn(async () => 'ok'),
}));
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
import { dayDoc, installSlotStore } from '../../fixtures/slotPlaces';
import { CARD_SHOP, NOW_OPEN, PLACED_CARD_ORDER, SLOT_1800 } from '../../fixtures/orders';

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
const hours = (mon: { open: string; close: string }[]) => ({ mon, tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] });
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

  it('inside the automatic hours the order is accepted at once', async () => {
    (findShopById as any).mockResolvedValue({
      ...CARD_SHOP,
      orderSettings: { autoAcceptHours: hours([{ open: '09:00', close: '18:00' }]) },
    });
    await executeHandlePaymentAuthorized(input);
    expect(acceptPlacedOrder).toHaveBeenCalledTimes(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('outside the automatic hours the order waits for staff', async () => {
    (findShopById as any).mockResolvedValue({
      ...CARD_SHOP,
      orderSettings: { autoAcceptHours: hours([{ open: '13:00', close: '18:00' }]) },
    });
    await executeHandlePaymentAuthorized(input);
    expect(acceptPlacedOrder).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ tag: 'order_received' }));
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

  it('a scheduled order waits without a decline time', async () => {
    (findCheckoutSessionById as any).mockResolvedValue({ ...session, scheduledFor: SLOT_1800 });
    (findShopById as any).mockResolvedValue(CARD_SHOP); // auto-accept on
    expect(await executeHandlePaymentAuthorized(input)).toBe('created');
    expect(acceptPlacedOrder).not.toHaveBeenCalled();
    const created = (createOrder as any).mock.calls[0][0];
    expect(created).toMatchObject({ scheduledFor: SLOT_1800 });
    expect(created.autoRejectAt).toBeUndefined();
    expect(created.queuedAt).toBeUndefined();
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Ma Pasta: Bestellung ZZZ-111 für Montag, 5. Oktober, 18:00 eingegangen' }),
    );
  });

  it('a scheduled order already due is treated like a new order', async () => {
    (findCheckoutSessionById as any).mockResolvedValue({ ...session, scheduledFor: '2026-10-05T10:15:00.000Z' });
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    await executeHandlePaymentAuthorized(input);
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ queuedAt: '2026-10-05T10:00:00.000Z', autoRejectAt: '2026-10-05T10:10:00.000Z' }),
    );
    expect(acceptPlacedOrder).toHaveBeenCalledTimes(1);
  });

  describe('booked orders', () => {
    const cappedManual = { ...manualShop, orderSettings: { ...manualShop.orderSettings, scheduledOrders: true, slotCapacity: 1 } };
    beforeEach(() => {
      (findCheckoutSessionById as any).mockResolvedValue({ ...session, scheduledFor: SLOT_1800 });
      (findShopById as any).mockResolvedValue(cappedManual);
    });
    const held = { orderId: 'sess-1', slot: SLOT_1800, heldUntil: '2026-10-05T10:05:00.000Z' };
    const kept = { orderId: 'sess-1', slot: SLOT_1800, heldUntil: null };

    it('a paid booking keeps its place for good', async () => {
      const store = installSlotStore([dayDoc('2026-10-05', [held])]);
      expect(await executeHandlePaymentAuthorized(input)).toBe('created');
      expect(store.doc('2026-10-05')!.places).toEqual([kept]);
    });

    it('a payment after the hold lapsed still gets its place, even over the limit', async () => {
      const other = { orderId: 'other', slot: SLOT_1800, heldUntil: null };
      const store = installSlotStore([dayDoc('2026-10-05', [other])]);
      expect(await executeHandlePaymentAuthorized(input)).toBe('created');
      expect(store.doc('2026-10-05')!.places).toEqual([other, kept]);
    });

    it('a repeated webhook still makes the place permanent', async () => {
      const store = installSlotStore([dayDoc('2026-10-05', [held])]);
      (createOrder as any).mockRejectedValueOnce({ code: 409 });
      expect(await executeHandlePaymentAuthorized(input)).toBe('duplicate');
      expect(store.doc('2026-10-05')!.places).toEqual([kept]);
    });
  });
});
