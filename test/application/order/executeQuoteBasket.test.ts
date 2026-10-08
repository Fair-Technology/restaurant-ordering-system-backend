import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({ findProductById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({
  findCategoriesByShopId: vi.fn(async () => (await import('../../fixtures/orders')).CATEGORIES),
}));
vi.mock('../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository', async () => ({
  getReferenceLists: vi.fn(async () => (await import('../../../src/domain/reference/ReferenceLists')).DE_REFERENCE_LISTS),
}));

vi.mock('../../../src/application/usage/orderLimitStatus', () => ({
  loadOrderLimitStatus: vi.fn(async () => ({ periodKey: '2026-10', acceptedOrderCount: 0, limit: 30, warningLevel: 0, limitReached: false })),
}));

import { loadOrderLimitStatus } from '../../../src/application/usage/orderLimitStatus';
import { executeQuoteBasket } from '../../../src/application/order/quoteBasket/executeQuoteBasket';
import { findProductById } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { MODE_NOT_OFFERED_ERROR } from '../../../src/domain/order/orderErrors';
import { CARD_SHOP, DELIVERY_SHOP, DINE_IN_SHOP, NOW_CLOSED, NOW_OPEN, P_COLA, P_PASTA } from '../../fixtures/orders';

const request = {
  shopId: 'shop-1',
  items: [
    { productId: 'p1', quantity: 1 },
    { productId: 'p2', quantity: 1 },
  ],
};

describe('executeQuoteBasket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    (findProductById as any).mockImplementation(async (id: string) => (id === 'p1' ? P_PASTA : id === 'p2' ? P_COLA : null));
  });

  it("quotes a card shop's basket", async () => {
    const res = await executeQuoteBasket(request, { now: NOW_OPEN });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({
      paymentMethods: ['card'],
      addressRequired: false,
      openNow: true,
      subtotalCents: 1400,
      taxCents: 125,
      prepMinutes: 20,
      belowMinimum: false,
    });
    expect(res.data.lines.map((l) => l.status)).toEqual(['ok', 'ok']);
  });

  it('the quote says when the order limit is reached', async () => {
    const open = await executeQuoteBasket(request, { now: NOW_OPEN });
    expect(open.ok && open.data.orderLimitReached).toBe(false);
    (loadOrderLimitStatus as any).mockResolvedValueOnce({ periodKey: '2026-10', acceptedOrderCount: 30, limit: 30, warningLevel: 100, limitReached: true });
    const stopped = await executeQuoteBasket(request, { now: NOW_OPEN });
    expect(stopped.ok && stopped.data.orderLimitReached).toBe(true);
  });

  it('offers nothing before Stripe is ready', async () => {
    (findShopById as any).mockResolvedValue({ ...CARD_SHOP, stripe: undefined });
    const res = await executeQuoteBasket(request, { now: NOW_OPEN });
    expect(res.ok && res.data.paymentMethods).toEqual([]);
  });

  it('says an address is needed above €250', async () => {
    const res = await executeQuoteBasket({ shopId: 'shop-1', items: [{ productId: 'p1', quantity: 24 }] }, { now: NOW_OPEN });
    expect(res.ok && res.data.addressRequired).toBe(true);
  });

  it('reports closed', async () => {
    const res = await executeQuoteBasket(request, { now: NOW_CLOSED });
    expect(res.ok && res.data.openNow).toBe(false);
  });

  it('refuses a paused shop', async () => {
    (findShopById as any).mockResolvedValue({ ...CARD_SHOP, isPaused: true });
    const res = await executeQuoteBasket(request, { now: NOW_OPEN });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'This shop is not currently accepting orders' });
  });

  it('quotes a table order when dine-in is on', async () => {
    (findShopById as any).mockResolvedValue(DINE_IN_SHOP);
    const res = await executeQuoteBasket({ ...request, fulfilmentMode: 'dine_in' as const }, { now: NOW_OPEN });
    expect(res.ok && res.data).toMatchObject({ fulfilmentMode: 'dine_in', prepMinutes: 20, paymentMethods: ['card'] });
  });

  it('refuses a table order when dine-in is off', async () => {
    const res = await executeQuoteBasket({ ...request, fulfilmentMode: 'dine_in' as const }, { now: NOW_OPEN });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: MODE_NOT_OFFERED_ERROR });
  });

  it("last orders follow the restaurant's own setting", async () => {
    const now = new Date('2026-10-05T19:50:00Z');
    const openNow = async (shop: object) => {
      (findShopById as any).mockResolvedValue(shop);
      const res = await executeQuoteBasket(request, { now });
      return res.ok && res.data.openNow;
    };
    expect(await openNow(CARD_SHOP)).toBe(false);
    expect(await openNow({ ...CARD_SHOP, orderSettings: { lastOrdersMinutes: 5 } })).toBe(true);
    expect(await openNow({ ...CARD_SHOP, orderSettings: { prepMinutes: { collection: 5 } } })).toBe(true);
  });

  it('busy mode lengthens the estimate but not the last-orders time', async () => {
    (findShopById as any).mockResolvedValue({
      ...CARD_SHOP,
      busyMode: { extraMinutes: 30, serviceDate: '2026-10-05', startedAt: '2026-10-05T19:00:00.000Z' },
    });
    const res = await executeQuoteBasket(request, { now: new Date('2026-10-05T19:35:00Z') });
    expect(res.ok && res.data).toMatchObject({ prepMinutes: 50, openNow: true });
  });

  it("quotes delivery with the fee and the postcode's minimum", async () => {
    (findShopById as any).mockResolvedValue(DELIVERY_SHOP);
    const res = await executeQuoteBasket({ ...request, fulfilmentMode: 'delivery' as const, postcode: '10115' }, { now: NOW_OPEN });
    expect(res.ok && res.data).toMatchObject({
      subtotalCents: 1400,
      deliveryFeeCents: 250,
      totalCents: 1650,
      postcodeServed: true,
      minOrderAmountCents: 1500,
      belowMinimum: true,
      taxCents: 141,
      prepMinutes: 45,
    });
  });

  it('says when a postcode is not served', async () => {
    (findShopById as any).mockResolvedValue(DELIVERY_SHOP);
    const res = await executeQuoteBasket({ ...request, fulfilmentMode: 'delivery' as const, postcode: '10999' }, { now: NOW_OPEN });
    expect(res.ok && res.data).toMatchObject({ postcodeServed: false, deliveryFeeCents: null, totalCents: 1400, minOrderAmountCents: 0 });
  });

  it('collection quotes carry no fee', async () => {
    const res = await executeQuoteBasket(request, { now: NOW_OPEN });
    expect(res.ok && res.data).toMatchObject({ deliveryFeeCents: null, postcodeServed: null, totalCents: 1400 });
  });

  it('a dish not offered for delivery is unavailable', async () => {
    (findShopById as any).mockResolvedValue(DELIVERY_SHOP);
    (findProductById as any).mockImplementation(async (id: string) =>
      id === 'p1' ? P_PASTA : id === 'p2' ? { ...P_COLA, unavailableModes: ['delivery'] } : null,
    );
    const delivery = await executeQuoteBasket({ ...request, fulfilmentMode: 'delivery' as const, postcode: '10115' }, { now: NOW_OPEN });
    expect(delivery.ok && delivery.data.lines.map((l) => l.status)).toEqual(['ok', 'unavailable']);
    const collection = await executeQuoteBasket(request, { now: NOW_OPEN });
    expect(collection.ok && collection.data.lines.map((l) => l.status)).toEqual(['ok', 'ok']);
  });
});
