import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({
  findProductById: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosCheckoutSessionRepository', () => ({
  createCheckoutSession: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({
  findCategoriesByShopId: vi.fn(async () => (await import('../../fixtures/orders')).CATEGORIES),
}));
vi.mock('../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository', async () => ({
  getReferenceLists: vi.fn(async () => (await import('../../../src/domain/reference/ReferenceLists')).DE_REFERENCE_LISTS),
}));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  createOrder: vi.fn(async (o) => o),
  findOrderById: vi.fn(async () => null),
}));
vi.mock('../../../src/infrastructure/email/emailSender', () => ({
  sendEmail: vi.fn(async () => undefined),
  emailTransportName: () => 'log',
}));
vi.mock('../../../src/domain/order/orderRef', () => ({ generateOrderRef: () => 'AB3-K7P' }));
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(function () {
    return { paymentIntents: { create: vi.fn(async () => ({ id: 'pi_1', client_secret: 'cs_1' })) } };
  }),
}));

import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { findProductById } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { createCheckoutSession } from '../../../src/infrastructure/cosmos/order/CosmosCheckoutSessionRepository';
import { createOrder, findOrderById } from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { sendEmail } from '../../../src/infrastructure/email/emailSender';
import { ACCEPTED_DPA, COMPLETE_LEGAL } from '../../fixtures/legal';
import { CARD_SHOP, LUNCH_HOURS, NOW_CLOSED, NOW_OPEN, P_COLA, P_PASTA, PLACED_CARD_ORDER } from '../../fixtures/orders';
import { executeCheckout } from '../../../src/application/order/checkout/executeCheckout';
import { CheckoutRequestDto } from '../../../src/application/order/checkout/dtos';
import {
  BASKET_CHANGED_ERROR,
  IDEMPOTENCY_KEY_ERROR,
  LEGAL_CHANGED_ERROR,
  PAYMENT_METHOD_NOT_OFFERED_ERROR,
  SHOP_CLOSED_ERROR,
} from '../../../src/domain/order/orderErrors';
import { orderIdForIdempotencyKey } from '../../../src/domain/order/orderIds';

const baseRequest: CheckoutRequestDto = {
  shopId: 'shop-1',
  items: [{ productId: 'p1', quantity: 1 }],
  customerName: 'Anna',
  customerEmail: 'a@example.com',
  customerPhone: '+49 30 1234',
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

describe('executeCheckout cash and card placement', () => {
  const cashRequest: CheckoutRequestDto = {
    shopId: 'shop-1',
    items: [
      { productId: 'p1', quantity: 1, expectedUnitPriceCents: 1050 },
      { productId: 'p2', quantity: 1, expectedUnitPriceCents: 350 },
    ],
    customerName: 'Anna',
    customerEmail: 'a@example.com',
    customerPhone: '+49 30 1234',
    paymentMethod: 'cash',
    idempotencyKey: 'key-12345678',
    language: 'de',
    legalRevisions: { terms: 1, withdrawal: 1 },
  };
  const TAX = [
    { rateBasisPoints: 700, grossCents: 1050, taxCents: 69 },
    { rateBasisPoints: 1900, grossCents: 350, taxCents: 56 },
  ];

  beforeAll(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  });
  afterAll(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });
  beforeEach(() => {
    vi.clearAllMocks();
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    (findProductById as any).mockImplementation(async (id: string) => (id === 'p1' ? P_PASTA : id === 'p2' ? P_COLA : null));
    (findOrderById as any).mockResolvedValue(null);
  });

  it('places a cash order as PLACED with cash due', async () => {
    const res = await executeCheckout(cashRequest, { now: NOW_OPEN });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({
      kind: 'cash',
      orderRef: 'AB3-K7P',
      state: 'PLACED',
      subtotalCents: 1400,
      currency: 'EUR',
      autoRejectAt: '2026-10-05T10:10:00.000Z',
      orderId: orderIdForIdempotencyKey('shop-1', 'key-12345678'),
    });
    expect((res.data as any).accessToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'PLACED',
        payment: { method: 'cash', status: 'cash_due', stripePaymentIntentId: null },
        taxBreakdown: TAX,
        legalRevisions: { terms: 1, withdrawal: 1 },
        language: 'de',
        idempotencyKey: 'key-12345678',
        history: [{ from: null, to: 'PLACED', at: '2026-10-05T10:00:00.000Z', actor: { type: 'customer' } }],
      }),
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['a@example.com'],
        subject: 'Ma Pasta: Bestellung AB3-K7P eingegangen',
        replyTo: 'info@mapasta.example',
      }),
    );
  });

  it('returns the existing order for a repeated idempotency key', async () => {
    (findOrderById as any).mockResolvedValue(PLACED_CARD_ORDER);
    const res = await executeCheckout(cashRequest, { now: NOW_OPEN });
    expect(res).toEqual({
      ok: true,
      data: {
        kind: 'cash',
        orderId: 'o1',
        orderRef: 'AB3-K7P',
        accessToken: 'T'.repeat(32),
        subtotalCents: 1050,
        currency: 'EUR',
        state: 'PLACED',
        autoRejectAt: '2026-10-05T10:10:00.000Z',
      },
    });
    expect(createOrder).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('returns the winner when a concurrent submit created the order first', async () => {
    (createOrder as any).mockRejectedValueOnce({ code: 409 });
    (findOrderById as any).mockResolvedValueOnce(null).mockResolvedValueOnce(PLACED_CARD_ORDER);
    const res = await executeCheckout(cashRequest, { now: NOW_OPEN });
    expect(res.ok && res.data.kind === 'cash' && res.data.orderId).toBe('o1');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('refuses card at a cash-only restaurant', async () => {
    const res = await executeCheckout({ ...cashRequest, paymentMethod: 'card' }, { now: NOW_OPEN });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: PAYMENT_METHOD_NOT_OFFERED_ERROR });
  });

  it('refuses when closed', async () => {
    const res = await executeCheckout(cashRequest, { now: NOW_CLOSED });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: SHOP_CLOSED_ERROR });
  });

  it('refuses a changed price', async () => {
    const res = await executeCheckout(
      { ...cashRequest, items: [{ productId: 'p1', quantity: 1, expectedUnitPriceCents: 1000 }] },
      { now: NOW_OPEN },
    );
    expect(res).toEqual({ ok: false, code: 'CONFLICT', error: BASKET_CHANGED_ERROR });
  });

  it('refuses when the terms changed since the diner looked', async () => {
    const res = await executeCheckout({ ...cashRequest, legalRevisions: { terms: 0, withdrawal: 1 } }, { now: NOW_OPEN });
    expect(res).toEqual({ ok: false, code: 'CONFLICT', error: LEGAL_CHANGED_ERROR });
  });

  it('requires an idempotency key for cash', async () => {
    const res = await executeCheckout({ ...cashRequest, idempotencyKey: undefined }, { now: NOW_OPEN });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: IDEMPOTENCY_KEY_ERROR });
  });

  it('a failing email does not fail the order', async () => {
    (sendEmail as any).mockRejectedValueOnce(new Error('boom'));
    const res = await executeCheckout(cashRequest, { now: NOW_OPEN });
    expect(res.ok).toBe(true);
  });

  it('card branch still creates a Stripe payment', async () => {
    (findShopById as any).mockResolvedValue({
      ...CARD_SHOP,
      paymentPolicy: 'pay_online',
      stripe: { connectAccountId: 'acct_1', connectOnboardingStatus: 'complete' },
    });
    const { paymentMethod: _m, idempotencyKey: _k, ...cardRequest } = cashRequest;
    const res = await executeCheckout(cardRequest, { now: NOW_OPEN });
    expect(res.ok && res.data.kind).toBe('card');
    expect(res.ok && (res.data as any).clientSecret).toBe('cs_1');
    expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ taxBreakdown: TAX }));
  });
});
