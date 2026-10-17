import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckoutSession } from '../../../src/domain/order/CheckoutSession';
import type { Order } from '../../../src/domain/order/Order';

vi.mock('../../../src/infrastructure/cosmos/order/CosmosCheckoutSessionRepository', () => ({ findCheckoutSessionById: vi.fn(), deleteCheckoutSession: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({ createOrder: vi.fn(), findOrderById: vi.fn(), findOrderWithEtag: vi.fn(), replaceOrderIfMatch: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/application/order/_shared/acceptPlacedOrder', () => ({ acceptPlacedOrder: vi.fn() }));
vi.mock('../../../src/infrastructure/stripe/stripeClient', () => ({ releaseAuthorization: vi.fn(async () => 'canceled'), createRefund: vi.fn(), listPaymentRefunds: vi.fn(async () => []), findLiveRefund: vi.fn(async () => null), retrievePaymentIntentSnapshot: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/usage/CosmosSlotPlacesRepository', () => ({ findSlotPlacesWithEtag: vi.fn(async () => null), createSlotPlaces: vi.fn(async () => 'ok'), replaceSlotPlacesIfMatch: vi.fn(async () => 'ok') }));
vi.mock('../../../src/infrastructure/email/emailSender', () => ({ sendEmail: vi.fn(async () => undefined), emailTransportName: () => 'log' }));
vi.mock('../../../src/domain/order/orderRef', () => ({ generateOrderRef: () => 'AB3-K7P' }));

import { acceptPlacedOrder } from '../../../src/application/order/_shared/acceptPlacedOrder';
import { executeHandlePaymentAuthorized } from '../../../src/application/order/handlePaymentAuthorized/executeHandlePaymentAuthorized';
import { reconcileCheckoutSession } from '../../../src/application/order/reconcile/reconcileCheckoutSession';
import { deleteCheckoutSession, findCheckoutSessionById } from '../../../src/infrastructure/cosmos/order/CosmosCheckoutSessionRepository';
import { createOrder, findOrderById } from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { sendEmail } from '../../../src/infrastructure/email/emailSender';
import { retrievePaymentIntentSnapshot } from '../../../src/infrastructure/stripe/stripeClient';
import { CARD_SHOP, NOW_OPEN, PLACED_CARD_ORDER } from '../../fixtures/orders';

const session: CheckoutSession = { id: 'sess-1', shopId: 'shop-1', stripePaymentIntentId: 'pi_1', items: PLACED_CARD_ORDER.items, subtotalCents: 1050, currency: 'EUR', customerName: 'Anna', customerEmail: 'a@example.com', customerPhone: '+49 30 1234', fulfilmentMode: 'collection', customerAccessToken: 'T'.repeat(32), orderRef: 'ZZZ-111', language: 'de', createdAt: '2026-10-05T09:59:00.000Z', ttl: 3600 };
const manualShop = { ...CARD_SHOP, orderSettings: { autoRejectMinutes: 10, alertEmail: null, autoAccept: false } };
const RESERVED = { id: 'pi_1', status: 'requires_capture', amountCents: 1050, currency: 'eur', sessionId: 'sess-1', authorizedAtMs: 1791194400000 - 60_000 };
const run = (s = session) => reconcileCheckoutSession({ session: s, now: NOW_OPEN, source: 'order_page' });
const snap = (extra: object = {}) => (retrievePaymentIntentSnapshot as any).mockResolvedValue({ ...RESERVED, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  (findCheckoutSessionById as any).mockReset().mockResolvedValue(session);
  (deleteCheckoutSession as any).mockReset().mockResolvedValue(undefined);
  (findOrderById as any).mockReset().mockResolvedValue(null);
  (createOrder as any).mockReset().mockImplementation(async (o: Order) => o);
  (findShopById as any).mockReset().mockResolvedValue(manualShop);
  (acceptPlacedOrder as any).mockReset().mockResolvedValue({ ok: true, data: {} });
  (retrievePaymentIntentSnapshot as any).mockReset().mockResolvedValue(RESERVED);
});

describe('reconcileCheckoutSession', () => {
  it('a reserved payment whose webhook never came becomes the order', async () => {
    expect(await run()).toBe('created');
    expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({ id: 'sess-1', state: 'PLACED', payment: { method: 'card', status: 'authorized', stripePaymentIntentId: 'pi_1' }, autoRejectAt: '2026-10-05T10:10:00.000Z' }));
    expect(retrievePaymentIntentSnapshot).toHaveBeenCalledWith({ connectAccountId: 'acct_1', paymentIntentId: 'pi_1' });
    expect(deleteCheckoutSession).toHaveBeenCalledWith('sess-1');
  });

  it('a payment reserved under 15 seconds ago is left to the webhook', async () => {
    snap({ authorizedAtMs: 1791194400000 - 14_999 });
    expect(await run()).toBe('too_fresh');
    expect(createOrder).not.toHaveBeenCalled();
    snap({ authorizedAtMs: 1791194400000 - 15_000 });
    expect(await run()).toBe('created');
  });

  it('a payment with no charge time is converted at once', async () => {
    snap({ authorizedAtMs: null });
    expect(await run()).toBe('created');
  });

  it.each(['requires_payment_method', 'requires_action', 'requires_confirmation', 'processing'])('a payment not yet reserved makes no order (%s)', async (status) => {
    snap({ status });
    expect(await run()).toBe('not_paid');
    expect(createOrder).not.toHaveBeenCalled();
    expect(deleteCheckoutSession).not.toHaveBeenCalled();
  });

  it('a taken payment counts as reserved', async () => {
    snap({ status: 'succeeded' });
    expect(await run()).toBe('created');
  });

  it('a cancelled payment removes the checkout', async () => {
    snap({ status: 'canceled' });
    expect(await run()).toBe('canceled');
    expect(deleteCheckoutSession).toHaveBeenCalledWith('sess-1');
    expect(createOrder).not.toHaveBeenCalled();
  });

  it.each([{ amountCents: 1049 }, { currency: 'usd' }, { sessionId: 'other' }, { id: 'pi_2' }])('a payment that does not match the checkout is left alone (%o)', async (extra) => {
    snap(extra);
    expect(await run()).toBe('mismatch');
    expect(createOrder).not.toHaveBeenCalled();
    expect(deleteCheckoutSession).not.toHaveBeenCalled();
  });

  it('the delivery total is what must match', async () => {
    snap({ amountCents: 1300 });
    expect(await run({ ...session, totalCents: 1300 })).toBe('created');
    snap({ amountCents: 1050 });
    expect(await run({ ...session, totalCents: 1300 })).toBe('mismatch');
  });

  it('checkouts older than an hour are never turned into orders', async () => {
    expect(await run({ ...session, _ts: 1791194400 - 3601 })).toBe('stale');
    expect(retrievePaymentIntentSnapshot).not.toHaveBeenCalled();
    expect(await run({ ...session, _ts: 1791194400 - 3600 })).toBe('created');
  });

  it('a shop without a Stripe account is skipped', async () => {
    (findShopById as any).mockResolvedValue({ ...manualShop, stripe: undefined });
    expect(await run()).toBe('no_account');
    expect(retrievePaymentIntentSnapshot).not.toHaveBeenCalled();
  });

  it('Stripe errors reach the caller', async () => {
    (retrievePaymentIntentSnapshot as any).mockRejectedValue({ type: 'StripeConnectionError' });
    await expect(run()).rejects.toEqual({ type: 'StripeConnectionError' });
  });

  describe('racing the webhook', () => {
    function liveStore() {
      const orders = new Map<string, Order>();
      let alive = true;
      (findCheckoutSessionById as any).mockImplementation(async () => (alive ? session : null));
      (deleteCheckoutSession as any).mockImplementation(async () => { alive = false; });
      (findOrderById as any).mockImplementation(async (id: string) => orders.get(id) ?? null);
      (createOrder as any).mockImplementation(async (o: Order) => { if (orders.has(o.id)) throw { code: 409 }; orders.set(o.id, o); return o; });
      return orders;
    }
    const webhook = () => executeHandlePaymentAuthorized({ sessionId: 'sess-1', paymentIntentId: 'pi_1', connectAccountId: 'acct_1', now: NOW_OPEN });
    const receivedEmails = () => (sendEmail as any).mock.calls.filter((c: any[]) => c[0].tag === 'order_received');

    it('webhook and safety net together make one order and one email', async () => {
      const orders = liveStore();
      const outcomes = (await Promise.all([webhook(), run()])).sort();
      expect(outcomes).toEqual(['created', 'duplicate']);
      expect(orders.size).toBe(1);
      expect(receivedEmails()).toHaveLength(1);
    });

    it('both pass the checkout check before either writes', async () => {
      liveStore();
      (findCheckoutSessionById as any).mockResolvedValue(session);
      const outcomes = (await Promise.all([webhook(), run()])).sort();
      expect(outcomes).toEqual(['created', 'duplicate']);
      expect(createOrder).toHaveBeenCalledTimes(2);
      expect(receivedEmails()).toHaveLength(1);
    });

    it('with auto-accept on, only the winner accepts', async () => {
      liveStore();
      (findShopById as any).mockResolvedValue(CARD_SHOP);
      await Promise.all([webhook(), run()]);
      expect(acceptPlacedOrder).toHaveBeenCalledTimes(1);
    });
  });
});
