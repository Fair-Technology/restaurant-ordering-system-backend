import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({ findProductById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({
  findCategoriesByShopId: vi.fn(async () => (await import('../../fixtures/orders')).CATEGORIES),
}));
vi.mock('../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository', async () => ({
  getReferenceLists: vi.fn(async () => (await import('../../../src/domain/reference/ReferenceLists')).DE_REFERENCE_LISTS),
}));

vi.mock('../../../src/infrastructure/cosmos/promotion/CosmosPromotionRepository', () => ({
  findPromotions: vi.fn(async () => null),
  findVoucher: vi.fn(async () => null),
}));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({ findDiscountUseRows: vi.fn(async () => []) }));

vi.mock('../../../src/infrastructure/cosmos/usage/CosmosSlotPlacesRepository', () => ({
  findSlotPlacesWithEtag: vi.fn(async () => null),
  createSlotPlaces: vi.fn(async () => 'ok'),
  replaceSlotPlacesIfMatch: vi.fn(async () => 'ok'),
}));
vi.mock('../../../src/application/usage/orderLimitStatus', () => ({
  loadOrderLimitStatus: vi.fn(async () => ({ periodKey: '2026-10', acceptedOrderCount: 0, limit: 30, warningLevel: 0, limitReached: false })),
}));

import { loadOrderLimitStatus } from '../../../src/application/usage/orderLimitStatus';
import { executeQuoteBasket } from '../../../src/application/order/quoteBasket/executeQuoteBasket';
import { findDiscountUseRows } from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { findPromotions, findVoucher } from '../../../src/infrastructure/cosmos/promotion/CosmosPromotionRepository';
import { findProductById } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { findSlotPlacesWithEtag } from '../../../src/infrastructure/cosmos/usage/CosmosSlotPlacesRepository';
import { capped, dayDoc, installSlotStore } from '../../fixtures/slotPlaces';
import { MODE_NOT_OFFERED_ERROR, SCHEDULED_FOR_ERROR } from '../../../src/domain/order/orderErrors';
import { CARD_SHOP, DELIVERY_SHOP, DINE_IN_SHOP, NOW_CLOSED, NOW_OPEN, P_COLA, P_PASTA, PROMO_CODE, PROMOTIONS, SCHEDULED_SHOP, VOUCHER } from '../../fixtures/orders';

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
    (findPromotions as any).mockResolvedValue(null);
    (findVoucher as any).mockResolvedValue(null);
    (findDiscountUseRows as any).mockResolvedValue([]);
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

  it('lists the free slots when the restaurant takes orders for later', async () => {
    (findShopById as any).mockResolvedValue(SCHEDULED_SHOP);
    const res = await executeQuoteBasket(request, { now: NOW_CLOSED });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.openNow).toBe(false);
    expect(res.data.slots).toHaveLength(172);
    expect(res.data.slots[0]).toBe('2026-10-06T09:30:00.000Z');
    expect(res.data.slotAvailable).toBeNull();
    expect(res.data.scheduledFor).toBeNull();
  });

  it('no slots while scheduling is off or for table orders', async () => {
    const off = await executeQuoteBasket(request, { now: NOW_OPEN });
    expect(off.ok && off.data.slots).toEqual([]);
    (findShopById as any).mockResolvedValue({ ...DINE_IN_SHOP, orderSettings: { ...DINE_IN_SHOP.orderSettings, scheduledOrders: true } });
    const table = await executeQuoteBasket({ ...request, fulfilmentMode: 'dine_in' as const }, { now: NOW_OPEN });
    expect(table.ok && table.data.slots).toEqual([]);
  });

  it('says whether the chosen slot is still free', async () => {
    (findShopById as any).mockResolvedValue(SCHEDULED_SHOP);
    const free = await executeQuoteBasket({ ...request, scheduledFor: '2026-10-06T16:00:00.000Z' }, { now: NOW_OPEN });
    expect(free.ok && free.data).toMatchObject({ slotAvailable: true, scheduledFor: '2026-10-06T16:00:00.000Z' });
    const gone = await executeQuoteBasket({ ...request, scheduledFor: '2026-10-05T10:15:00.000Z' }, { now: NOW_OPEN });
    expect(gone.ok && gone.data.slotAvailable).toBe(false);
    const bad = await executeQuoteBasket({ ...request, scheduledFor: '2026-10-06T16:10:00.000Z' }, { now: NOW_OPEN });
    expect(bad).toEqual({ ok: false, code: 'INVALID_INPUT', error: SCHEDULED_FOR_ERROR });
  });

  describe('capacity', () => {
    const S16 = '2026-10-06T16:00:00.000Z';
    const S0930 = '2026-10-06T09:30:00.000Z';
    beforeEach(() => {
      installSlotStore([
        dayDoc('2026-10-06', [
          { orderId: 'a', slot: S16, heldUntil: null },
          { orderId: 'b', slot: S16, heldUntil: null },
          { orderId: 'c', slot: S0930, heldUntil: null },
          { orderId: 'd', slot: S0930, heldUntil: '2026-10-05T20:00:00.000Z' },
        ]),
      ]);
      (findShopById as any).mockResolvedValue(capped(2));
    });

    it('full times are left out of the list', async () => {
      const res = await executeQuoteBasket(request, { now: NOW_CLOSED });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.data.slots).toHaveLength(171);
      expect(res.data.slots[0]).toBe(S0930);
      expect(res.data.slots).not.toContain(S16);
      expect(res.data.slots).toContain('2026-10-06T16:15:00.000Z');
    });

    it('a full chosen time is not available', async () => {
      const full = await executeQuoteBasket({ ...request, scheduledFor: S16 }, { now: NOW_OPEN });
      expect(full.ok && full.data.slotAvailable).toBe(false);
      const free = await executeQuoteBasket({ ...request, scheduledFor: '2026-10-06T16:15:00.000Z' }, { now: NOW_OPEN });
      expect(free.ok && free.data.slotAvailable).toBe(true);
    });

    it('without a limit no places are read', async () => {
      (findShopById as any).mockResolvedValue(SCHEDULED_SHOP);
      vi.mocked(findSlotPlacesWithEtag).mockClear();
      const res = await executeQuoteBasket(request, { now: NOW_CLOSED });
      expect(res.ok && res.data.slots).toHaveLength(172);
      expect(findSlotPlacesWithEtag).not.toHaveBeenCalled();
    });
  });

  it('a scheduled basket is priced for the time it is made', async () => {
    const P_LUNCH = { ...P_PASTA, schedule: { startDate: '2026-10-01', startTime: '11:00', endTime: '15:00', offerPrice: 800 } };
    (findShopById as any).mockResolvedValue(SCHEDULED_SHOP);
    (findProductById as any).mockImplementation(async (id: string) => (id === 'p1' ? P_LUNCH : id === 'p2' ? P_COLA : null));
    const now = await executeQuoteBasket(request, { now: NOW_OPEN });
    expect(now.ok && now.data.lines[0]).toMatchObject({ status: 'ok', unitPriceCents: 800 });
    const evening = await executeQuoteBasket({ ...request, scheduledFor: '2026-10-06T16:00:00.000Z' }, { now: NOW_OPEN });
    expect(evening.ok && evening.data.lines[0].status).toBe('unavailable');
    const noon = await executeQuoteBasket({ ...request, scheduledFor: '2026-10-06T10:30:00.000Z' }, { now: NOW_OPEN });
    expect(noon.ok && noon.data.lines[0]).toMatchObject({ status: 'ok', unitPriceCents: 800 });
  });

  it('offers the code box only when the restaurant has codes or loyalty', async () => {
    const none = await executeQuoteBasket(request, { now: NOW_OPEN });
    expect(none.ok && none.data).toMatchObject({ acceptsCodes: false, loyalty: null, discount: null, discountProblem: null });
    (findPromotions as any).mockResolvedValue(PROMOTIONS);
    const some = await executeQuoteBasket(request, { now: NOW_OPEN });
    expect(some.ok && some.data).toMatchObject({ acceptsCodes: true, loyalty: { everyOrders: 5, rewardCents: 500 } });
  });

  it('a valid code lowers the quote', async () => {
    (findPromotions as any).mockResolvedValue(PROMOTIONS);
    const res = await executeQuoteBasket({ ...request, discountCode: 'welcome10' }, { now: NOW_OPEN });
    expect(res.ok && res.data).toMatchObject({
      subtotalCents: 1400,
      discount: { kind: 'code', code: 'WELCOME10', cents: 140 },
      discountProblem: null,
      totalCents: 1260,
      taxCents: 112,
    });
  });

  it('says why a code does not apply', async () => {
    const quote = async (promotions: unknown, discountCode: string) => {
      (findPromotions as any).mockResolvedValue(promotions);
      const res = await executeQuoteBasket({ ...request, discountCode }, { now: NOW_OPEN });
      expect(res.ok).toBe(true);
      return res.ok ? res.data : null;
    };
    const withCode = (c: object) => ({ ...PROMOTIONS, codes: [{ ...PROMO_CODE, ...c }] });
    expect(await quote(PROMOTIONS, 'NOPE1')).toMatchObject({ discount: null, discountProblem: 'unknown', totalCents: 1400 });
    expect(await quote(PROMOTIONS, 'a b')).toMatchObject({ discountProblem: 'unknown' });
    expect(await quote(withCode({ validUntil: '2026-10-04' }), 'WELCOME10')).toMatchObject({ discountProblem: 'expired' });
    expect(await quote(withCode({ validFrom: '2026-10-06' }), 'WELCOME10')).toMatchObject({ discountProblem: 'not_started' });
    expect(await quote(withCode({ minSubtotalCents: 2000 }), 'WELCOME10')).toMatchObject({
      discountProblem: 'minimum',
      discountMinSubtotalCents: 2000,
    });
    (findDiscountUseRows as any).mockResolvedValue([{ state: 'ACCEPTED', acceptedAt: '2026-10-01T10:00:00.000Z', customerEmail: 'b@x.example' }]);
    expect(await quote(withCode({ totalLimit: 1 }), 'WELCOME10')).toMatchObject({ discountProblem: 'used_up' });
    (findDiscountUseRows as any).mockResolvedValue([{ state: 'REJECTED', customerEmail: 'b@x.example' }]);
    expect(await quote(withCode({ totalLimit: 1 }), 'WELCOME10')).toMatchObject({ discount: { cents: 140 } });
  });

  it('a voucher is a fixed amount, once', async () => {
    (findVoucher as any).mockResolvedValue(VOUCHER);
    const ok = await executeQuoteBasket({ ...request, discountCode: 'l-abcd2345' }, { now: NOW_OPEN });
    expect(ok.ok && ok.data).toMatchObject({ discount: { kind: 'voucher', code: 'L-ABCD2345', cents: 500 }, totalCents: 900 });
    (findDiscountUseRows as any).mockResolvedValue([{ state: 'PLACED', customerEmail: 'x@x.example' }]);
    const used = await executeQuoteBasket({ ...request, discountCode: 'l-abcd2345' }, { now: NOW_OPEN });
    expect(used.ok && used.data).toMatchObject({ discountProblem: 'used_up' });
    (findDiscountUseRows as any).mockResolvedValue([]);
    (findVoucher as any).mockResolvedValue({ ...VOUCHER, expiresOn: '2026-10-04' });
    const old = await executeQuoteBasket({ ...request, discountCode: 'l-abcd2345' }, { now: NOW_OPEN });
    expect(old.ok && old.data).toMatchObject({ discountProblem: 'expired' });
  });
});
