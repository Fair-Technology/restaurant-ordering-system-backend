import { describe, it, expect, vi, beforeEach } from 'vitest';

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
}));
vi.mock('../../../src/infrastructure/email/emailSender', () => ({
  sendEmail: vi.fn(async () => undefined),
  emailTransportName: () => 'log',
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
import { findOrderById } from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { createPaymentIntent } from '../../../src/infrastructure/stripe/stripeClient';
import { ACCEPTED_DPA, COMPLETE_LEGAL } from '../../fixtures/legal';
import { ADDRESS, CARD_SHOP, LUNCH_HOURS, NOW_CLOSED, NOW_OPEN, P_COLA, P_PASTA, PLACED_CARD_ORDER } from '../../fixtures/orders';
import { executeCheckout } from '../../../src/application/order/checkout/executeCheckout';
import { CheckoutRequestDto } from '../../../src/application/order/checkout/dtos';
import {
  ADDRESS_INVALID_ERROR,
  ADDRESS_REQUIRED_ERROR,
  BASKET_CHANGED_ERROR,
  IDEMPOTENCY_KEY_ERROR,
  LEGAL_CHANGED_ERROR,
  NO_PAYMENT_SETUP_ERROR,
  SHOP_CLOSED_ERROR,
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

  it('rejects delivery for now', async () => {
    const res = await executeCheckout({ ...baseRequest, fulfilmentMode: 'delivery' });
    expect(res).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'Only collection orders are available at the moment',
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
        currency: 'EUR',
      },
    });
    expect(createPaymentIntent).not.toHaveBeenCalled();
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
});
