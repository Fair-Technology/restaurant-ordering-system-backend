import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({
  findProductById: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosCheckoutSessionRepository', () => ({
  findCheckoutSessionById: vi.fn(async () => null),
  upsertCheckoutSession: vi.fn(async (s) => s),
}));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({
  findCategoriesByShopId: vi.fn(async () => (await import('../../fixtures/orders')).CATEGORIES),
}));
vi.mock('../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository', async () => ({
  getReferenceLists: vi.fn(async () => (await import('../../../src/domain/reference/ReferenceLists')).DE_REFERENCE_LISTS),
}));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findOrderById: vi.fn(async () => null),
  findDiscountUseRows: vi.fn(async () => []),
}));
vi.mock('../../../src/infrastructure/cosmos/promotion/CosmosPromotionRepository', () => ({
  findPromotions: vi.fn(async () => null),
  findVoucher: vi.fn(async () => null),
}));
vi.mock('../../../src/infrastructure/cosmos/usage/CosmosSlotPlacesRepository', () => ({
  findSlotPlacesWithEtag: vi.fn(async () => null),
  createSlotPlaces: vi.fn(async () => 'ok'),
  replaceSlotPlacesIfMatch: vi.fn(async () => 'ok'),
}));
vi.mock('../../../src/infrastructure/email/emailSender', () => ({
  sendEmail: vi.fn(async () => undefined),
  emailTransportName: () => 'log',
}));
vi.mock('../../../src/application/usage/orderLimitStatus', () => ({
  loadOrderLimitStatus: vi.fn(async () => ({ periodKey: '2026-10', acceptedOrderCount: 0, limit: 30, warningLevel: 0, limitReached: false })),
}));
vi.mock('../../../src/domain/order/orderRef', () => ({ generateOrderRef: () => 'AB3-K7P' }));
vi.mock('../../../src/infrastructure/stripe/stripeClient', () => ({
  createPaymentIntent: vi.fn(async () => ({ id: 'pi_1', clientSecret: 'cs_1' })),
  isStripeIdempotencyError: (e: any) => e?.type === 'StripeIdempotencyError',
}));

import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { findProductById } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import {
  findCheckoutSessionById,
  upsertCheckoutSession,
} from '../../../src/infrastructure/cosmos/order/CosmosCheckoutSessionRepository';
import { findPromotions } from '../../../src/infrastructure/cosmos/promotion/CosmosPromotionRepository';
import { findDiscountUseRows, findOrderById } from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { loadOrderLimitStatus } from '../../../src/application/usage/orderLimitStatus';
import { createPaymentIntent } from '../../../src/infrastructure/stripe/stripeClient';
import { findSlotPlacesWithEtag } from '../../../src/infrastructure/cosmos/usage/CosmosSlotPlacesRepository';
import { capped, dayDoc, installSlotStore } from '../../fixtures/slotPlaces';
import { ACCEPTED_DPA, COMPLETE_LEGAL } from '../../fixtures/legal';
import { ADDRESS, CARD_SHOP, COMBO_CHOICES, P_COMBO, LUNCH_HOURS, NOW_CLOSED, NOW_OPEN, P_COLA, P_PASTA, PLACED_CARD_ORDER, DINE_IN_SHOP, PLACED_TABLE_ORDER, DELIVERY_SHOP, DELIVERY_ZONE, SCHEDULED_SHOP, PROMO_CODE, PROMOTIONS } from '../../fixtures/orders';
import { executeCheckout } from '../../../src/application/order/checkout/executeCheckout';
import { CheckoutRequestDto } from '../../../src/application/order/checkout/dtos';
import {
  ADDRESS_INVALID_ERROR,
  ADDRESS_REQUIRED_ERROR,
  BASKET_CHANGED_ERROR,
  DELIVERY_ADDRESS_INVALID_ERROR,
  DELIVERY_FEE_CHANGED_ERROR,
  DISCOUNT_ALREADY_USED_ERROR,
  DISCOUNT_CHANGED_ERROR,
  DISCOUNT_CODE_FORMAT_ERROR,
  EXPECTED_DISCOUNT_ERROR,
  LOYALTY_OPT_IN_ERROR,
  DELIVERY_POSTCODE_NOT_SERVED_ERROR,
  IDEMPOTENCY_KEY_ERROR,
  LEGAL_CHANGED_ERROR,
  MODE_NOT_OFFERED_ERROR,
  NO_PAYMENT_SETUP_ERROR,
  ORDER_LIMIT_REACHED_ERROR,
  SCHEDULE_NOT_FOR_TABLES_ERROR,
  SCHEDULED_FOR_ERROR,
  SHOP_CLOSED_ERROR,
  SLOT_UNAVAILABLE_ERROR,
  TABLE_INVALID_ERROR,
} from '../../../src/domain/order/orderErrors';
import { orderIdForIdempotencyKey } from '../../../src/domain/order/orderIds';

const baseRequest: CheckoutRequestDto = {
  shopId: 'shop-1',
  items: [{ productId: 'p1', quantity: 1 }],
  customerName: 'Anna',
  customerEmail: 'a@example.com',
  customerPhone: '+49 30 1234',
  idempotencyKey: 'key-12345678',
};

describe('executeCheckout fulfilmentMode validation', () => {
  it('rejects an unknown mode', async () => {
    const res = await executeCheckout({ ...baseRequest, fulfilmentMode: 'teleport' as any });
    expect(res).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'fulfilmentMode must be one of collection, delivery, dine_in',
    });
    expect(findShopById).not.toHaveBeenCalled();
  });
});

describe('executeCheckout menu declaration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a dish without an allergen declaration', async () => {
    (findShopById as any).mockResolvedValue({
      id: 'shop-1',
      isDeleted: false,
      isPaused: false,
      timezone: 'Europe/Berlin',
      currency: 'EUR',
      paymentPolicy: 'pay_online',
      openingHours: LUNCH_HOURS,
      closures: [],
      stripe: { connectAccountId: 'acct_1', connectOnboardingStatus: 'complete' },
      legal: COMPLETE_LEGAL,
      dpaAcceptance: ACCEPTED_DPA,
    });
    (findProductById as any).mockResolvedValue({
      id: 'p1',
      shopId: 'shop-1',
      name: 'Margherita',
      price: 900,
      isAvailable: true,
      isDeleted: false,
      allergenIds: null,
      additiveIds: null,
      schedule: null,
    });

    const res = await executeCheckout(baseRequest, { now: NOW_OPEN });

    expect(res).toEqual({ ok: false, code: 'CONFLICT', error: BASKET_CHANGED_ERROR });
  });

  it('refuses an order while the legal pack is incomplete', async () => {
    (findShopById as any).mockResolvedValue({
      id: 'shop-1',
      isDeleted: false,
      isPaused: false,
      timezone: 'Europe/Berlin',
      currency: 'EUR',
      stripe: { connectAccountId: 'acct_1', connectOnboardingStatus: 'complete' },
    });

    const res = await executeCheckout(baseRequest);

    expect(res).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'This restaurant has not finished its legal setup yet',
    });
    expect(findProductById).not.toHaveBeenCalled();
  });
});

describe('executeCheckout card placement', () => {
  const cardRequest: CheckoutRequestDto = {
    shopId: 'shop-1',
    items: [
      { productId: 'p1', quantity: 1, expectedUnitPriceCents: 1050 },
      { productId: 'p2', quantity: 1, expectedUnitPriceCents: 350 },
    ],
    customerName: 'Anna',
    customerEmail: 'a@example.com',
    customerPhone: '+49 30 1234',
    idempotencyKey: 'key-12345678',
    language: 'de',
    legalRevisions: { terms: 1, withdrawal: 1 },
  };
  const TAX = [
    { rateBasisPoints: 700, grossCents: 1050, taxCents: 69 },
    { rateBasisPoints: 1900, grossCents: 350, taxCents: 56 },
  ];
  const SESSION_ID = orderIdForIdempotencyKey('shop-1', 'key-12345678');

  beforeEach(() => {
    vi.clearAllMocks();
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    (findProductById as any).mockImplementation(async (id: string) => (id === 'p1' ? P_PASTA : id === 'p2' ? P_COLA : null));
    (findOrderById as any).mockResolvedValue(null);
    (findCheckoutSessionById as any).mockResolvedValue(null);
  });

  it('starts a card payment and returns the order link', async () => {
    const res = await executeCheckout(cardRequest, { now: NOW_OPEN });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({
      kind: 'card',
      sessionId: SESSION_ID,
      orderId: SESSION_ID,
      clientSecret: 'cs_1',
      subtotalCents: 1400,
      currency: 'EUR',
      stripeConnectAccountId: 'acct_1',
    });
    expect((res.data as any).accessToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(createPaymentIntent).toHaveBeenCalledWith({
      connectAccountId: 'acct_1',
      amountCents: 1400,
      currency: 'EUR',
      description: 'Ma Pasta AB3-K7P',
      orderRef: 'AB3-K7P',
      sessionId: SESSION_ID,
      idempotencyKey: `checkout-${SESSION_ID}`,
    });
    expect(upsertCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: SESSION_ID,
        stripePaymentIntentId: 'pi_1',
        taxBreakdown: TAX,
        orderRef: 'AB3-K7P',
        idempotencyKey: 'key-12345678',
        legalRevisions: { terms: 1, withdrawal: 1 },
      }),
    );
  });

  it('a repeated submit reuses the same payment and link', async () => {
    (findCheckoutSessionById as any).mockResolvedValue({
      id: SESSION_ID,
      orderRef: 'ZZZ-111',
      customerAccessToken: 'K'.repeat(32),
      createdAt: '2026-10-05T09:50:00.000Z',
    });
    const res = await executeCheckout(cardRequest, { now: NOW_OPEN });
    expect(res.ok && res.data).toMatchObject({ kind: 'card', accessToken: 'K'.repeat(32) });
    expect(createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ orderRef: 'ZZZ-111', idempotencyKey: `checkout-${SESSION_ID}` }),
    );
  });

  it('returns the order when it already exists for the key', async () => {
    (findOrderById as any).mockResolvedValue(PLACED_CARD_ORDER);
    const res = await executeCheckout(cardRequest, { now: NOW_OPEN });
    expect(res).toEqual({
      ok: true,
      data: {
        kind: 'placed',
        orderId: 'o1',
        orderRef: 'AB3-K7P',
        accessToken: 'T'.repeat(32),
        subtotalCents: 1050,
        totalCents: 1050,
        currency: 'EUR',
      },
    });
    expect(createPaymentIntent).not.toHaveBeenCalled();
  });

  it('refuses a new order once the monthly limit is reached', async () => {
    (loadOrderLimitStatus as any).mockResolvedValueOnce({ periodKey: '2026-10', acceptedOrderCount: 30, limit: 30, warningLevel: 100, limitReached: true });
    const res = await executeCheckout(cardRequest, { now: NOW_OPEN });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: ORDER_LIMIT_REACHED_ERROR });
    expect(createPaymentIntent).not.toHaveBeenCalled();
  });

  it('a repeated submit still finds its order at the limit', async () => {
    (loadOrderLimitStatus as any).mockResolvedValue({ periodKey: '2026-10', acceptedOrderCount: 30, limit: 30, warningLevel: 100, limitReached: true });
    (findOrderById as any).mockResolvedValue(PLACED_CARD_ORDER);
    const res = await executeCheckout(cardRequest, { now: NOW_OPEN });
    (loadOrderLimitStatus as any).mockReset();
    expect(res.ok && res.data.kind).toBe('placed');
  });

  it('requires an email', async () => {
    const res = await executeCheckout({ ...cardRequest, customerEmail: '' }, { now: NOW_OPEN });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'customerEmail is required' });
  });

  it('requires an idempotency key', async () => {
    const res = await executeCheckout({ ...cardRequest, idempotencyKey: undefined }, { now: NOW_OPEN });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: IDEMPOTENCY_KEY_ERROR });
  });

  it('offers nothing before Stripe is ready', async () => {
    (findShopById as any).mockResolvedValue({ ...CARD_SHOP, stripe: undefined });
    const res = await executeCheckout(cardRequest, { now: NOW_OPEN });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: NO_PAYMENT_SETUP_ERROR });
  });

  it('refuses when closed', async () => {
    const res = await executeCheckout(cardRequest, { now: NOW_CLOSED });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: SHOP_CLOSED_ERROR });
  });

  it('refuses when the restaurant stops orders earlier', async () => {
    (findShopById as any).mockResolvedValue({ ...CARD_SHOP, orderSettings: { lastOrdersMinutes: 60 } });
    const res = await executeCheckout(cardRequest, { now: new Date('2026-10-05T19:05:00Z') });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: SHOP_CLOSED_ERROR });
  });

  it('refuses a changed price', async () => {
    const res = await executeCheckout(
      { ...cardRequest, items: [{ productId: 'p1', quantity: 1, expectedUnitPriceCents: 1000 }] },
      { now: NOW_OPEN },
    );
    expect(res).toEqual({ ok: false, code: 'CONFLICT', error: BASKET_CHANGED_ERROR });
  });

  it('refuses when the terms changed since the diner looked', async () => {
    const res = await executeCheckout({ ...cardRequest, legalRevisions: { terms: 0, withdrawal: 1 } }, { now: NOW_OPEN });
    expect(res).toEqual({ ok: false, code: 'CONFLICT', error: LEGAL_CHANGED_ERROR });
  });

  it('a changed basket under the same key is reported as a changed basket', async () => {
    (createPaymentIntent as any).mockRejectedValueOnce({ type: 'StripeIdempotencyError' });
    const res = await executeCheckout(cardRequest, { now: NOW_OPEN });
    expect(res).toEqual({ ok: false, code: 'CONFLICT', error: BASKET_CHANGED_ERROR });
    expect(upsertCheckoutSession).not.toHaveBeenCalled();
  });

  it('an order over €250 needs an address', async () => {
    const big = { ...cardRequest, items: [{ productId: 'p1', quantity: 24, expectedUnitPriceCents: 1050 }] };
    const res = await executeCheckout(big, { now: NOW_OPEN });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: ADDRESS_REQUIRED_ERROR });
    expect(createPaymentIntent).not.toHaveBeenCalled();
  });

  it('keeps the address with the checkout', async () => {
    const big = { ...cardRequest, items: [{ productId: 'p1', quantity: 24, expectedUnitPriceCents: 1050 }] };
    const res = await executeCheckout(
      { ...big, customerAddress: { ...ADDRESS, street: ' Musterstraße 1 ' } },
      { now: NOW_OPEN },
    );
    expect(res.ok).toBe(true);
    expect(upsertCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ customerAddress: ADDRESS }));

    const half = await executeCheckout({ ...cardRequest, customerAddress: { ...ADDRESS, city: '' } }, { now: NOW_OPEN });
    expect(half).toEqual({ ok: false, code: 'INVALID_INPUT', error: ADDRESS_INVALID_ERROR });
  });

  describe('table orders', () => {
    const tableRequest: CheckoutRequestDto = { ...cardRequest, fulfilmentMode: 'dine_in', table: ' Terrasse  3 ' };

    it('starts a table order with its table', async () => {
      (findShopById as any).mockResolvedValue(DINE_IN_SHOP);
      const res = await executeCheckout(tableRequest, { now: NOW_OPEN });
      expect(res.ok && res.data.kind).toBe('card');
      expect(upsertCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ fulfilmentMode: 'dine_in', table: { label: 'Terrasse 3' } }),
      );
    });

    it('a table order needs a valid table', async () => {
      (findShopById as any).mockResolvedValue(DINE_IN_SHOP);
      for (const table of [undefined, '', 'Bar 1 Links hinten', 7 as any]) {
        const res = await executeCheckout({ ...tableRequest, table }, { now: NOW_OPEN });
        expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: TABLE_INVALID_ERROR });
      }
      expect(findShopById).not.toHaveBeenCalled();
    });

    it('refuses a table order while dine-in is off', async () => {
      const res = await executeCheckout(tableRequest, { now: NOW_OPEN });
      expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: MODE_NOT_OFFERED_ERROR });
      expect(createPaymentIntent).not.toHaveBeenCalled();
    });

    it('a collection order ignores a table', async () => {
      const res = await executeCheckout({ ...cardRequest, table: '7' }, { now: NOW_OPEN });
      expect(res.ok).toBe(true);
      expect((upsertCheckoutSession as any).mock.calls[0][0]).not.toHaveProperty('table');
    });

    it('a repeated table submit returns its order after dine-in was switched off', async () => {
      (findOrderById as any).mockResolvedValue(PLACED_TABLE_ORDER);
      const res = await executeCheckout(tableRequest, { now: NOW_OPEN });
      expect(res.ok && res.data.kind === 'placed' && res.data.orderId === 'o2').toBe(true);
    });
  });

  describe('delivery orders', () => {
    beforeEach(() => (findShopById as any).mockResolvedValue(DELIVERY_SHOP));
    const deliveryRequest: CheckoutRequestDto = {
      ...cardRequest,
      items: [
        { productId: 'p1', quantity: 1, expectedUnitPriceCents: 1050 },
        { productId: 'p2', quantity: 2, expectedUnitPriceCents: 350 },
      ],
      fulfilmentMode: 'delivery',
      deliveryAddress: { street: 'Teststraße 1', postcode: '10 115', city: 'Berlin' },
      expectedDeliveryFeeCents: 250,
    };

    it('starts a delivery order with the fee on top', async () => {
      const res = await executeCheckout(deliveryRequest, { now: NOW_OPEN });
      expect(res.ok && res.data).toMatchObject({ kind: 'card', subtotalCents: 1750, totalCents: 2000 });
      expect(createPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 2000 }));
      expect(upsertCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          fulfilmentMode: 'delivery',
          deliveryAddress: { street: 'Teststraße 1', postcode: '10115', city: 'Berlin' },
          charges: [{ kind: 'delivery_fee', grossCents: 250, taxClassId: 'food', taxRateBasisPoints: 700, taxCents: 16 }],
          subtotalCents: 1750,
          totalCents: 2000,
          taxBreakdown: [
            { rateBasisPoints: 700, grossCents: 1300, taxCents: 85 },
            { rateBasisPoints: 1900, grossCents: 700, taxCents: 112 },
          ],
        }),
      );
    });

    it('refuses a postcode the restaurant does not deliver to', async () => {
      const res = await executeCheckout(
        { ...deliveryRequest, deliveryAddress: { street: 'Teststraße 1', postcode: '10999', city: 'Berlin' } },
        { now: NOW_OPEN },
      );
      expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: DELIVERY_POSTCODE_NOT_SERVED_ERROR });
      expect(createPaymentIntent).not.toHaveBeenCalled();
    });

    it('a delivery order needs a full address', async () => {
      const res = await executeCheckout(
        { ...deliveryRequest, deliveryAddress: { street: 'Teststraße 1', postcode: '10115' } as any },
        { now: NOW_OPEN },
      );
      expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: DELIVERY_ADDRESS_INVALID_ERROR });
      expect(findShopById).not.toHaveBeenCalled();
    });

    it("uses the postcode's minimum, not counting the fee", async () => {
      const small = { ...deliveryRequest, items: [{ productId: 'p1', quantity: 1, expectedUnitPriceCents: 1050 }] };
      expect(await executeCheckout(small, { now: NOW_OPEN })).toEqual({
        ok: false,
        code: 'INVALID_INPUT',
        error: 'Order total is below the minimum of EUR 15.00',
      });
      (findShopById as any).mockResolvedValue({
        ...DELIVERY_SHOP,
        minOrderAmountCents: 5000,
        orderSettings: { delivery: true, deliveryZones: [{ postcode: '10115', feeCents: 250, minOrderCents: 1000 }] },
      });
      const res = await executeCheckout(small, { now: NOW_OPEN });
      expect(res.ok).toBe(true);
    });

    it('a changed delivery fee needs a new look', async () => {
      const res = await executeCheckout({ ...deliveryRequest, expectedDeliveryFeeCents: 200 }, { now: NOW_OPEN });
      expect(res).toEqual({ ok: false, code: 'CONFLICT', error: DELIVERY_FEE_CHANGED_ERROR });
    });

    it('refuses delivery while the restaurant has it switched off', async () => {
      (findShopById as any).mockResolvedValue(CARD_SHOP);
      const res = await executeCheckout(deliveryRequest, { now: NOW_OPEN });
      expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: MODE_NOT_OFFERED_ERROR });
    });

    it('delivery follows its own hours', async () => {
      (findShopById as any).mockResolvedValue({
        ...DELIVERY_SHOP,
        orderSettings: {
          delivery: true,
          deliveryZones: [DELIVERY_ZONE],
          deliveryHours: { mon: [{ open: '17:00', close: '22:00' }], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
        },
      });
      expect(await executeCheckout(deliveryRequest, { now: NOW_OPEN })).toEqual({ ok: false, code: 'INVALID_INPUT', error: SHOP_CLOSED_ERROR });
      const collection = await executeCheckout(cardRequest, { now: NOW_OPEN });
      expect(collection.ok).toBe(true);
    });

    it('the fee counts towards the 250 euro address rule', async () => {
      (findShopById as any).mockResolvedValue({
        ...DELIVERY_SHOP,
        orderSettings: { delivery: true, deliveryZones: [{ postcode: '10115', feeCents: 1000, minOrderCents: 0 }] },
      });
      const items = [{ productId: 'p1', quantity: 23, expectedUnitPriceCents: 1050 }];
      const res = await executeCheckout({ ...deliveryRequest, items, expectedDeliveryFeeCents: 1000 }, { now: NOW_OPEN });
      expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: ADDRESS_REQUIRED_ERROR });
      const collection = await executeCheckout({ ...cardRequest, items }, { now: NOW_OPEN });
      expect(collection.ok).toBe(true);
    });
  });

  describe('discounts', () => {
    const withCode: CheckoutRequestDto = { ...cardRequest, discountCode: 'WELCOME10', expectedDiscountCents: 140 };
    beforeEach(() => {
      (findPromotions as any).mockResolvedValue(PROMOTIONS);
      (findDiscountUseRows as any).mockResolvedValue([]);
    });
    afterEach(() => {
      (findPromotions as any).mockResolvedValue(null);
      (findDiscountUseRows as any).mockResolvedValue([]);
    });

    it('a code lowers the charge and is kept with the checkout', async () => {
      const res = await executeCheckout(withCode, { now: NOW_OPEN });
      expect(res.ok).toBe(true);
      expect(createPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 1260 }));
      expect(upsertCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          subtotalCents: 1400,
          totalCents: 1260,
          discount: {
            kind: 'code',
            code: 'WELCOME10',
            cents: 140,
            byRate: [
              { rateBasisPoints: 700, grossCents: 105, taxCents: 7 },
              { rateBasisPoints: 1900, grossCents: 35, taxCents: 6 },
            ],
          },
          taxBreakdown: [
            { rateBasisPoints: 700, grossCents: 945, taxCents: 62 },
            { rateBasisPoints: 1900, grossCents: 315, taxCents: 50 },
          ],
        }),
      );
      const saved = (upsertCheckoutSession as any).mock.calls[0][0];
      expect(saved.items.map((i: { discountCents?: number }) => i.discountCents)).toEqual([105, 35]);
      expect(res.ok && res.data).toMatchObject({ subtotalCents: 1400, totalCents: 1260 });
    });

    it('a discount spreads over the dishes of a combo', async () => {
      (findProductById as any).mockImplementation(
        async (id: string) => ({ p1: P_PASTA, p2: P_COLA, p9: P_COMBO } as Record<string, unknown>)[id] ?? null,
      );
      const res = await executeCheckout(
        {
          ...cardRequest,
          items: [{ productId: 'p9', quantity: 1, expectedUnitPriceCents: 1200, comboChoices: COMBO_CHOICES }],
          discountCode: 'WELCOME10',
          expectedDiscountCents: 120,
        },
        { now: NOW_OPEN },
      );
      expect(res.ok).toBe(true);
      expect(createPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 1080 }));
      expect(upsertCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          subtotalCents: 1200,
          totalCents: 1080,
          taxBreakdown: [
            { rateBasisPoints: 700, grossCents: 810, taxCents: 53 },
            { rateBasisPoints: 1900, grossCents: 270, taxCents: 43 },
          ],
        }),
      );
      expect((upsertCheckoutSession as any).mock.calls[0][0].items).toMatchObject([
        { productName: 'Pasta-Menü: Carbonara', unitPriceCents: 900, discountCents: 90, combo: { line: 0, productId: 'p9', name: 'Pasta-Menü' } },
        { productName: 'Pasta-Menü: Cola', unitPriceCents: 300, discountCents: 30 },
      ]);
    });

    it('a changed discount needs a new look', async () => {
      const res = await executeCheckout({ ...withCode, expectedDiscountCents: 100 }, { now: NOW_OPEN });
      expect(res).toEqual({ ok: false, code: 'CONFLICT', error: DISCOUNT_CHANGED_ERROR });
      expect(createPaymentIntent).not.toHaveBeenCalled();
    });

    it('a code that stopped working is reported as a changed discount', async () => {
      (findPromotions as any).mockResolvedValue({ ...PROMOTIONS, codes: [{ ...PROMO_CODE, active: false }] });
      const res = await executeCheckout(withCode, { now: NOW_OPEN });
      expect(res).toEqual({ ok: false, code: 'CONFLICT', error: DISCOUNT_CHANGED_ERROR });
    });

    it('a diner cannot use a code twice', async () => {
      (findDiscountUseRows as any).mockResolvedValue([
        { state: 'COMPLETED', acceptedAt: '2026-10-01T10:00:00.000Z', customerEmail: 'A@Example.com' },
      ]);
      const res = await executeCheckout(withCode, { now: NOW_OPEN });
      expect(res).toEqual({ ok: false, code: 'CONFLICT', error: DISCOUNT_ALREADY_USED_ERROR });
    });

    it('the shop minimum is checked before the discount', async () => {
      (findShopById as any).mockResolvedValue({ ...CARD_SHOP, minOrderAmountCents: 1400 });
      const res = await executeCheckout(withCode, { now: NOW_OPEN });
      expect(res.ok).toBe(true);
      expect(createPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 1260 }));
    });

    it('the 250 euro rule uses the discounted total', async () => {
      const items = [{ productId: 'p1', quantity: 25 }];
      const res = await executeCheckout({ ...withCode, items, expectedDiscountCents: 2625 }, { now: NOW_OPEN });
      expect(res.ok).toBe(true);
      expect(createPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 23625 }));
      const plain = await executeCheckout({ ...cardRequest, items }, { now: NOW_OPEN });
      expect(plain).toEqual({ ok: false, code: 'INVALID_INPUT', error: ADDRESS_REQUIRED_ERROR });
    });

    it('a scheduled order judges the code when it is placed', async () => {
      (findShopById as any).mockResolvedValue(SCHEDULED_SHOP);
      (findPromotions as any).mockResolvedValue({ ...PROMOTIONS, codes: [{ ...PROMO_CODE, validUntil: '2026-10-05' }] });
      const res = await executeCheckout({ ...withCode, scheduledFor: '2026-10-06T16:00:00.000Z' }, { now: NOW_CLOSED });
      expect(res.ok).toBe(true);
      expect(createPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 1260 }));
    });

    it('the loyalty tick is kept only while the restaurant runs loyalty', async () => {
      const tick = { ...cardRequest, loyaltyOptIn: true };
      await executeCheckout(tick, { now: NOW_OPEN });
      expect((upsertCheckoutSession as any).mock.calls[0][0].loyaltyOptIn).toBe(true);
      vi.clearAllMocks();
      (findPromotions as any).mockResolvedValue(null);
      await executeCheckout(tick, { now: NOW_OPEN });
      expect((upsertCheckoutSession as any).mock.calls[0][0]).not.toHaveProperty('loyaltyOptIn');
      vi.clearAllMocks();
      (findPromotions as any).mockResolvedValue({ ...PROMOTIONS, loyalty: { ...PROMOTIONS.loyalty!, enabled: false } });
      await executeCheckout(tick, { now: NOW_OPEN });
      expect((upsertCheckoutSession as any).mock.calls[0][0]).not.toHaveProperty('loyaltyOptIn');
    });

    it('refuses a malformed code or tick', async () => {
      expect(await executeCheckout({ ...cardRequest, discountCode: 'a b' }, { now: NOW_OPEN })).toEqual({
        ok: false, code: 'INVALID_INPUT', error: DISCOUNT_CODE_FORMAT_ERROR,
      });
      expect(await executeCheckout({ ...cardRequest, loyaltyOptIn: 'yes' as any }, { now: NOW_OPEN })).toEqual({
        ok: false, code: 'INVALID_INPUT', error: LOYALTY_OPT_IN_ERROR,
      });
      expect(await executeCheckout({ ...cardRequest, expectedDiscountCents: 1.5 }, { now: NOW_OPEN })).toEqual({
        ok: false, code: 'INVALID_INPUT', error: EXPECTED_DISCOUNT_ERROR,
      });
    });

    it('without a code a non-zero expected discount is a change', async () => {
      const res = await executeCheckout({ ...cardRequest, expectedDiscountCents: 140 }, { now: NOW_OPEN });
      expect(res).toEqual({ ok: false, code: 'CONFLICT', error: DISCOUNT_CHANGED_ERROR });
    });
  });

  describe('scheduled orders', () => {
    const SLOT = '2026-10-06T16:00:00.000Z';
    beforeEach(() => {
      (findShopById as any).mockResolvedValue(SCHEDULED_SHOP);
      (loadOrderLimitStatus as any).mockImplementation(async () => ({ periodKey: '2026-10', acceptedOrderCount: 0, limit: 30, warningLevel: 0, limitReached: false }));
    });

    it('starts a scheduled order for a free slot', async () => {
      const res = await executeCheckout({ ...cardRequest, scheduledFor: SLOT }, { now: NOW_OPEN });
      expect(res.ok && res.data.kind).toBe('card');
      expect(upsertCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ scheduledFor: SLOT }));
    });

    it('a scheduled order can be placed while the restaurant is closed', async () => {
      const res = await executeCheckout({ ...cardRequest, scheduledFor: SLOT }, { now: NOW_CLOSED });
      expect(res.ok).toBe(true);
      const asap = await executeCheckout(cardRequest, { now: NOW_CLOSED });
      expect(asap).toEqual({ ok: false, code: 'INVALID_INPUT', error: SHOP_CLOSED_ERROR });
    });

    it('refuses a slot that is gone', async () => {
      for (const scheduledFor of ['2026-10-05T10:15:00.000Z', '2026-10-09T10:15:00.000Z']) {
        const res = await executeCheckout({ ...cardRequest, scheduledFor }, { now: NOW_OPEN });
        expect(res).toEqual({ ok: false, code: 'CONFLICT', error: SLOT_UNAVAILABLE_ERROR });
      }
      expect(createPaymentIntent).not.toHaveBeenCalled();
    });

    describe('capacity', () => {
      beforeEach(() => (findShopById as any).mockResolvedValue(capped(1)));
      const HOLD = { orderId: SESSION_ID, slot: SLOT, heldUntil: '2026-10-05T10:20:00.000Z' };

      it('holds a place for 20 minutes before the card is reserved', async () => {
        const store = installSlotStore();
        const res = await executeCheckout({ ...cardRequest, scheduledFor: SLOT }, { now: NOW_OPEN });
        expect(res.ok).toBe(true);
        expect(store.doc('2026-10-06')!.places).toEqual([HOLD]);
      });

      it('refuses a full time before any card is reserved', async () => {
        installSlotStore([dayDoc('2026-10-06', [{ orderId: 'other', slot: SLOT, heldUntil: null }])]);
        const res = await executeCheckout({ ...cardRequest, scheduledFor: SLOT }, { now: NOW_OPEN });
        expect(res).toEqual({ ok: false, code: 'CONFLICT', error: SLOT_UNAVAILABLE_ERROR });
        expect(createPaymentIntent).not.toHaveBeenCalled();
        expect(upsertCheckoutSession).not.toHaveBeenCalled();
      });

      it('a lapsed hold does not count', async () => {
        const store = installSlotStore([
          dayDoc('2026-10-06', [{ orderId: 'other', slot: SLOT, heldUntil: '2026-10-05T09:59:00.000Z' }]),
        ]);
        const res = await executeCheckout({ ...cardRequest, scheduledFor: SLOT }, { now: NOW_OPEN });
        expect(res.ok).toBe(true);
        expect(store.doc('2026-10-06')!.places).toEqual([HOLD]);
      });

      it('a repeated submit keeps one place', async () => {
        const store = installSlotStore();
        const a = await executeCheckout({ ...cardRequest, scheduledFor: SLOT }, { now: NOW_OPEN });
        const b = await executeCheckout({ ...cardRequest, scheduledFor: SLOT }, { now: NOW_OPEN });
        expect(a.ok && b.ok).toBe(true);
        expect(store.doc('2026-10-06')!.places).toHaveLength(1);
      });

      it('a failed card reservation gives the place back', async () => {
        const store = installSlotStore();
        (createPaymentIntent as any).mockRejectedValueOnce({ type: 'StripeIdempotencyError' });
        const res = await executeCheckout({ ...cardRequest, scheduledFor: SLOT }, { now: NOW_OPEN });
        expect(res).toEqual({ ok: false, code: 'CONFLICT', error: BASKET_CHANGED_ERROR });
        expect(store.doc('2026-10-06')!.places).toEqual([]);
      });

      it('orders for now hold nothing at checkout', async () => {
        installSlotStore();
        vi.mocked(findSlotPlacesWithEtag).mockClear();
        const res = await executeCheckout(cardRequest, { now: NOW_OPEN });
        expect(res.ok).toBe(true);
        expect(findSlotPlacesWithEtag).not.toHaveBeenCalled();
      });
    });

    it('refuses a time that is not a slot', async () => {
      for (const scheduledFor of ['2026-10-06T16:10:00.000Z', 'tomorrow']) {
        const res = await executeCheckout({ ...cardRequest, scheduledFor }, { now: NOW_OPEN });
        expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: SCHEDULED_FOR_ERROR });
      }
      expect(findShopById).not.toHaveBeenCalled();
    });

    it('table orders cannot be scheduled', async () => {
      const res = await executeCheckout({ ...cardRequest, fulfilmentMode: 'dine_in', table: '7', scheduledFor: SLOT }, { now: NOW_OPEN });
      expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: SCHEDULE_NOT_FOR_TABLES_ERROR });
    });

    it('scheduling is off unless the restaurant allows it', async () => {
      (findShopById as any).mockResolvedValue(CARD_SHOP);
      const res = await executeCheckout({ ...cardRequest, scheduledFor: SLOT }, { now: NOW_OPEN });
      expect(res).toEqual({ ok: false, code: 'CONFLICT', error: SLOT_UNAVAILABLE_ERROR });
    });

    it("a slot in next month checks next month's limit", async () => {
      (loadOrderLimitStatus as any).mockImplementation(async (_s: unknown, at: Date) => ({
        periodKey: 'x',
        acceptedOrderCount: 30,
        limit: 30,
        warningLevel: 100,
        limitReached: at.toISOString() >= '2026-11-01',
      }));
      const now = new Date('2026-10-30T10:00:00Z');
      const full = await executeCheckout({ ...cardRequest, scheduledFor: '2026-11-02T11:00:00.000Z' }, { now });
      expect(full).toEqual({ ok: false, code: 'INVALID_INPUT', error: ORDER_LIMIT_REACHED_ERROR });
      expect(loadOrderLimitStatus).toHaveBeenCalledWith(expect.anything(), new Date('2026-11-02T11:00:00.000Z'));
      const same = await executeCheckout({ ...cardRequest, scheduledFor: '2026-10-31T11:00:00.000Z' }, { now });
      expect(same.ok).toBe(true);
    });
  });
});
