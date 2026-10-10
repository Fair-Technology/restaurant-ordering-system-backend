import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopBySlug: vi.fn() }));
vi.mock('../../../src/application/usage/orderLimitStatus', () => ({
  loadOrderLimitStatus: vi.fn(async () => ({ periodKey: '2026-10', acceptedOrderCount: 0, limit: 30, warningLevel: 0, limitReached: false })),
}));

import { loadOrderLimitStatus } from '../../../src/application/usage/orderLimitStatus';
import { executeGetShopBySlug } from '../../../src/application/shop/getShopBySlug/executeGetShopBySlug';
import { findShopBySlug } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { CARD_SHOP, DELIVERY_SHOP, DINE_IN_SHOP } from '../../fixtures/orders';

describe('executeGetShopBySlug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('the public shop says when the order limit pauses ordering', async () => {
    (findShopBySlug as any).mockResolvedValue(CARD_SHOP);
    (loadOrderLimitStatus as any).mockResolvedValueOnce({ periodKey: '2026-10', acceptedOrderCount: 30, limit: 30, warningLevel: 100, limitReached: true });
    const res = await executeGetShopBySlug({ slug: 'mapasta' });
    expect(res.ok && res.data.orderLimitReached).toBe(true);
  });

  it('a failing limit lookup keeps the shop open', async () => {
    (findShopBySlug as any).mockResolvedValue(CARD_SHOP);
    (loadOrderLimitStatus as any).mockRejectedValueOnce(new Error('x'));
    const res = await executeGetShopBySlug({ slug: 'mapasta' });
    expect(res.ok && res.data.orderLimitReached).toBe(false);
  });

  it('offers dine-in only when switched on', async () => {
    (findShopBySlug as any).mockResolvedValue(CARD_SHOP);
    const off = await executeGetShopBySlug({ slug: 'mapasta' });
    expect(off.ok && off.data.fulfilment.modes).toEqual(['collection']);

    (findShopBySlug as any).mockResolvedValue(DINE_IN_SHOP);
    const on = await executeGetShopBySlug({ slug: 'mapasta' });
    expect(on.ok && on.data.fulfilment.modes).toEqual(['collection', 'dine_in']);
    expect(on.ok && on.data.fulfilment.prepMinutes.dine_in).toBe(20);
  });

  it('the shop page estimate includes busy mode', async () => {
    (findShopBySlug as any).mockResolvedValue({
      ...CARD_SHOP,
      busyMode: { extraMinutes: 15, serviceDate: '2026-10-05', startedAt: '2026-10-05T09:00:00.000Z' },
    });
    const busy = await executeGetShopBySlug({ slug: 'mapasta' }, { now: new Date('2026-10-05T10:00:00Z') });
    expect(busy.ok && busy.data.fulfilment.prepMinutes).toEqual({ collection: 35, delivery: 60, dine_in: 35 });
    const next = await executeGetShopBySlug({ slug: 'mapasta' }, { now: new Date('2026-10-06T10:00:00Z') });
    expect(next.ok && next.data.fulfilment.prepMinutes.collection).toBe(20);
  });

  it('the shop page gets the phone from the legal notice, and null when it is missing', async () => {
    const impressum = { phone: ' 069 1234567 ' } as any;
    (findShopBySlug as any).mockResolvedValue({ ...CARD_SHOP, legal: { impressum, terms: null, withdrawal: null, privacyAddition: null, revisions: [] } });
    const res = await executeGetShopBySlug({ slug: 'mapasta' });
    expect(res.ok && res.data.phone).toBe('069 1234567');
    (findShopBySlug as any).mockResolvedValue({ ...CARD_SHOP, legal: undefined });
    const none = await executeGetShopBySlug({ slug: 'mapasta' });
    expect(none.ok && none.data.phone).toBeNull();
  });

  it('the shop page gets separate delivery hours when the restaurant set them', async () => {
    const deliveryHours = { mon: [{ open: '17:00', close: '21:00' }], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
    (findShopBySlug as any).mockResolvedValue({
      ...DELIVERY_SHOP,
      orderSettings: { ...(DELIVERY_SHOP as any).orderSettings, deliveryHours },
    });
    const res = await executeGetShopBySlug({ slug: 'mapasta' });
    expect(res.ok && res.data.fulfilment.delivery?.hours).toEqual(deliveryHours);
  });

  it('the shop page lists delivery postcodes while delivery is on', async () => {
    (findShopBySlug as any).mockResolvedValue(DELIVERY_SHOP);
    const res = await executeGetShopBySlug({ slug: 'mapasta' });
    expect(res.ok && res.data.fulfilment.modes).toEqual(['collection', 'delivery']);
    expect(res.ok && res.data.fulfilment.delivery).toEqual({ zones: [{ postcode: '10115', feeCents: 250, minOrderCents: 1500 }], hours: null });
    expect(res.ok && res.data.countryCode).toBe('DE');
    (findShopBySlug as any).mockResolvedValue(CARD_SHOP);
    const off = await executeGetShopBySlug({ slug: 'mapasta' });
    expect(off.ok && off.data.fulfilment.delivery).toBeNull();
  });

  it('the public shop passes the banner switch through, and leaves it missing (on) when never set', async () => {
    const branding = { logoUrl: null, heroImageUrl: 'https://cdn.example.com/h.jpg', accentColor: null };
    (findShopBySlug as any).mockResolvedValue({ ...CARD_SHOP, branding: { ...branding, showHero: false } });
    const off = await executeGetShopBySlug({ slug: 'mapasta' });
    expect(off.ok && off.data.branding?.showHero).toBe(false);
    expect(off.ok && off.data.branding?.heroImageUrl).toBe(branding.heroImageUrl);
    (findShopBySlug as any).mockResolvedValue({ ...CARD_SHOP, branding });
    const unset = await executeGetShopBySlug({ slug: 'mapasta' });
    expect(unset.ok && unset.data.branding?.showHero).toBeUndefined();
  });
});
