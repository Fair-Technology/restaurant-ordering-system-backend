import { describe, expect, it } from 'vitest';
import { priceBasket } from '../../../src/application/order/_shared/priceBasket';
import { DE_REFERENCE_LISTS } from '../../../src/domain/reference/ReferenceLists';
import { CATEGORIES, NOW_OPEN, P_COLA, P_PASTA, P_SALAD } from '../../fixtures/orders';
import type { Product } from '../../../src/domain/product/Product';

const SHOP = { timezone: 'Europe/Berlin', menuLanguages: ['de' as const], countryCode: 'DE' };

function price(
  items: Parameters<typeof priceBasket>[0]['items'],
  extra: Partial<Parameters<typeof priceBasket>[0]> = {},
  products: Product[] = [P_PASTA, P_COLA, P_SALAD],
) {
  return priceBasket({
    items,
    products: new Map(products.map((p) => [p.id, p])),
    categories: CATEGORIES,
    refs: DE_REFERENCE_LISTS,
    shop: SHOP,
    mode: 'collection',
    now: NOW_OPEN,
    language: 'de',
    ...extra,
  });
}

describe('priceBasket', () => {
  it('prices a dish with size and extras and taxes it at 7%', () => {
    const r = price([{ productId: 'p1', quantity: 2, selectedVariantOptionId: 'big', selectedAddonOptionIds: ['parm'] }]);
    expect(r.lines[0].status).toBe('ok');
    expect(r.items[0]).toMatchObject({
      unitPriceCents: 1450,
      lineTotalCents: 2900,
      taxRateBasisPoints: 700,
      taxCents: 190,
      selectedVariantOptionName: 'Groß',
      selectedAddonOptionNames: ['Parmesan'],
    });
    expect(r.subtotalCents).toBe(2900);
  });

  it('taxes a drink at 19%', () => {
    const r = price([{ productId: 'p2', quantity: 1 }]);
    expect(r.items[0]).toMatchObject({ taxClassId: 'beverage', taxCents: 56 });
    expect(r.taxBreakdown).toEqual([{ rateBasisPoints: 1900, grossCents: 350, taxCents: 56 }]);
  });

  it('mixed basket breakdown', () => {
    const r = price([
      { productId: 'p1', quantity: 1 },
      { productId: 'p2', quantity: 1 },
    ]);
    expect(r.subtotalCents).toBe(1400);
    expect(r.taxBreakdown).toEqual([
      { rateBasisPoints: 700, grossCents: 1050, taxCents: 69 },
      { rateBasisPoints: 1900, grossCents: 350, taxCents: 56 },
    ]);
  });

  it('flags a changed price', () => {
    const r = price([{ productId: 'p2', quantity: 1, expectedUnitPriceCents: 300 }]);
    expect(r.lines[0]).toMatchObject({ status: 'price_changed', expectedUnitPriceCents: 300 });
    expect(r.lines[0].item?.unitPriceCents).toBe(350);
    expect(r.allOk).toBe(false);
  });

  it('flags a sold-out dish as unavailable', () => {
    const r = price([{ productId: 'p2', quantity: 1 }], {}, [{ ...P_COLA, isAvailable: false }]);
    expect(r.lines[0]).toMatchObject({ status: 'unavailable', item: null, displayName: 'Cola' });
  });

  it('flags an unknown dish', () => {
    const r = price([{ productId: 'nope', quantity: 1 }]);
    expect(r.lines[0]).toMatchObject({ status: 'unavailable', item: null, displayName: null });
  });

  it('flags a sold-out size', () => {
    const r = price([{ productId: 'p1', quantity: 1, selectedVariantOptionId: 'off' }]);
    expect(r.lines[0].status).toBe('unavailable');
  });

  it('enforces an extra group minimum and maximum', () => {
    expect(price([{ productId: 'p3', quantity: 1 }]).lines[0].status).toBe('invalid_options');
    expect(price([{ productId: 'p3', quantity: 1, selectedAddonOptionIds: ['oil', 'yog'] }]).lines[0].status).toBe(
      'invalid_options',
    );
    expect(price([{ productId: 'p3', quantity: 1, selectedAddonOptionIds: ['oil'] }]).lines[0].status).toBe('ok');
  });

  it('localises the display name but keeps the original for the kitchen', () => {
    const r = price([{ productId: 'p1', quantity: 1 }], {
      shop: { ...SHOP, menuLanguages: ['de', 'en'] },
      language: 'en',
    });
    expect(r.lines[0].displayName).toBe('Carbonara (EN)');
    expect(r.items[0].productName).toBe('Carbonara');
  });

  describe('offer prices', () => {
    // Lunch window 11:00-15:00 Berlin time, every day, offer 8.00 against the normal 10.50.
    const lunch = (over: Partial<NonNullable<Product['schedule']>> = {}): Product => ({
      ...P_PASTA,
      schedule: { startDate: '2026-10-01', startTime: '11:00', endTime: '15:00', offerPrice: 800, ...over },
    });
    const at = (iso: string, p: Product = lunch(), qty = 1, extra: Record<string, unknown> = {}) =>
      price([{ productId: 'p1', quantity: qty, ...extra }], { now: new Date(iso) }, [p]);

    it('charges the offer price inside the window and takes VAT from it', () => {
      const r = at('2026-10-05T10:00:00Z', lunch(), 2); // 12:00 Berlin
      expect(r.lines[0].status).toBe('ok');
      expect(r.items[0]).toMatchObject({ unitPriceCents: 800, lineTotalCents: 1600, taxCents: 105 });
      expect(r.subtotalCents).toBe(1600);
      expect(r.taxBreakdown).toEqual([{ rateBasisPoints: 700, grossCents: 1600, taxCents: 105 }]);
    });

    it('adds size and extra surcharges on top of the offer price', () => {
      const r = at('2026-10-05T10:00:00Z', lunch(), 2, { selectedVariantOptionId: 'big', selectedAddonOptionIds: ['parm'] });
      expect(r.items[0]).toMatchObject({ unitPriceCents: 1200, lineTotalCents: 2400 });
    });

    it('window edges: first and last minute are in, the minute after is out of the menu', () => {
      expect(at('2026-10-05T09:00:00Z').items[0].unitPriceCents).toBe(800); // 11:00 Berlin
      expect(at('2026-10-05T12:59:30Z').items[0].unitPriceCents).toBe(800); // 14:59 Berlin
      expect(at('2026-10-05T13:00:00Z').items[0].unitPriceCents).toBe(800); // 15:00 Berlin
      expect(at('2026-10-05T13:01:00Z').lines[0].status).toBe('unavailable'); // 15:01
      expect(at('2026-10-05T08:59:00Z').lines[0].status).toBe('unavailable'); // 10:59
    });

    it('judges the window in the shop time zone, not UTC', () => {
      // 10:00Z is 12:00 in Berlin (inside) but 06:00 in New York (outside).
      const ny = { ...SHOP, timezone: 'America/New_York' };
      expect(price([{ productId: 'p1', quantity: 1 }], { now: new Date('2026-10-05T10:00:00Z'), shop: ny }, [lunch()]).lines[0].status).toBe('unavailable');
      expect(price([{ productId: 'p1', quantity: 1 }], { now: new Date('2026-10-05T16:00:00Z'), shop: ny }, [lunch()]).items[0].unitPriceCents).toBe(800);
    });

    it('uses the supplied clock, not the real one, for days and dates', () => {
      expect(at('2026-10-05T10:00:00Z', lunch({ daysOfWeek: [2] })).lines[0].status).toBe('unavailable'); // Monday
      expect(at('2026-10-06T10:00:00Z', lunch({ daysOfWeek: [2] })).items[0].unitPriceCents).toBe(800); // Tuesday
      expect(at('2026-10-05T10:00:00Z', lunch({ endDate: '2026-10-04' })).lines[0].status).toBe('unavailable');
    });

    it('charges the normal price when the schedule has no offer', () => {
      expect(at('2026-10-05T10:00:00Z', lunch({ offerPrice: null })).items[0].unitPriceCents).toBe(1050);
    });

    it('never charges an offer that is not below the normal price', () => {
      expect(at('2026-10-05T10:00:00Z', lunch({ offerPrice: 1050 })).items[0].unitPriceCents).toBe(1050);
      expect(at('2026-10-05T10:00:00Z', lunch({ offerPrice: 2000 })).items[0].unitPriceCents).toBe(1050);
    });

    it('flags a basket the diner priced at the normal amount as price_changed', () => {
      const r = at('2026-10-05T10:00:00Z', lunch(), 1, { expectedUnitPriceCents: 1050 });
      expect(r.lines[0]).toMatchObject({ status: 'price_changed' });
      expect(r.lines[0].item?.unitPriceCents).toBe(800);
    });
  });
});
