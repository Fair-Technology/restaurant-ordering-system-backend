import { describe, expect, it } from 'vitest';
import { basketProductIds, priceBasket, validateBasketItems } from '../../../src/application/order/_shared/priceBasket';
import { DE_REFERENCE_LISTS } from '../../../src/domain/reference/ReferenceLists';
import { CATEGORIES, COMBO_CHOICES, COMBO_ORDER, NOW_OPEN, P_COLA, P_COMBO, P_COMBO_BMF, P_PASTA, P_SALAD } from '../../fixtures/orders';
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

  it('a dish switched off for this mode is unavailable', () => {
    const products = [P_PASTA, { ...P_COLA, unavailableModes: ['delivery' as const] }];
    expect(price([{ productId: 'p2', quantity: 1 }], { mode: 'delivery' }, products).lines[0].status).toBe('unavailable');
    expect(price([{ productId: 'p2', quantity: 1 }], { mode: 'collection' }, products).lines[0].status).toBe('ok');
  });
});

describe('combos', () => {
  const ALL = [P_PASTA, P_COLA, P_SALAD, P_COMBO, P_COMBO_BMF];
  const combo = (extra: Record<string, unknown> = {}, opts: Partial<Parameters<typeof priceBasket>[0]> = {}, products: Product[] = ALL) =>
    price([{ productId: 'p9', quantity: 1, comboChoices: COMBO_CHOICES, ...extra }], opts, products);

  it('splits the combo price over its dishes by their own prices', () => {
    expect(combo().lines[0]).toMatchObject({ status: 'ok', item: null, unitPriceCents: 1200, lineTotalCents: 1200, displayName: 'Pasta-Menü' });
    expect(combo().items).toEqual(COMBO_ORDER.items);
    expect(combo().taxBreakdown).toEqual([
      { rateBasisPoints: 700, grossCents: 900, taxCents: 59 },
      { rateBasisPoints: 1900, grossCents: 300, taxCents: 48 },
    ]);
  });

  it('sizes and extras of a combo dish are charged on top and split with the rest', () => {
    const r = combo({
      quantity: 2,
      comboChoices: [
        { groupId: 'g-main', productId: 'p1', selectedVariantOptionId: 'big', selectedAddonOptionIds: ['parm'] },
        { groupId: 'g-drink', productId: 'p2' },
      ],
    });
    expect(r.lines[0]).toMatchObject({ unitPriceCents: 1600, lineTotalCents: 3200 });
    expect(r.items.map((i) => [i.unitPriceCents, i.lineTotalCents, i.taxCents])).toEqual([
      [1289, 2578, 169],
      [311, 622, 99],
    ]);
    expect(r.items[0]).toMatchObject({ productName: 'Pasta-Menü: Carbonara', selectedVariantOptionName: 'Groß', selectedAddonOptionNames: ['Parmesan'] });
    expect(r.subtotalCents).toBe(3200);
  });

  it('the BMF option puts 30 percent on the drinks', () => {
    const r = price([{ productId: 'p10', quantity: 1, comboChoices: COMBO_CHOICES }], {}, ALL);
    expect(r.items.map((i) => [i.unitPriceCents, i.taxCents])).toEqual([[840, 55], [360, 57]]);
  });

  it('a dish on offer weighs in at its offer price', () => {
    const lunch = { ...P_PASTA, schedule: { startDate: '2026-10-01', startTime: '11:00', endTime: '15:00', offerPrice: 800 } };
    const r = combo({}, {}, [lunch, P_COLA, P_SALAD, P_COMBO]);
    expect(r.items.map((i) => i.unitPriceCents)).toEqual([835, 365]);
  });

  it('a combo needs exactly one allowed dish per group', () => {
    const bad: Array<Record<string, unknown>> = [
      { comboChoices: [COMBO_CHOICES[0]] },
      { comboChoices: [COMBO_CHOICES[0], { groupId: 'g-main', productId: 'p3', selectedAddonOptionIds: ['oil'] }] },
      { comboChoices: [{ groupId: 'g-main', productId: 'p2' }, COMBO_CHOICES[1]] },
      { comboChoices: [COMBO_CHOICES[0], { groupId: 'g-x', productId: 'p2' }] },
      { selectedVariantOptionId: 'big' },
      { comboChoices: [{ groupId: 'g-main', productId: 'p3' }, COMBO_CHOICES[1]] },
    ];
    for (const extra of bad) expect(combo(extra).lines[0].status).toBe('invalid_options');
  });

  it('a combo cannot hold a combo', () => {
    const nested = { ...P_COMBO, combo: { ...P_COMBO.combo!, groups: [{ id: 'g-main', name: 'X', productIds: ['p10'] }, P_COMBO.combo!.groups[1]] } };
    const r = combo({ comboChoices: [{ groupId: 'g-main', productId: 'p10' }, COMBO_CHOICES[1]] }, {}, [...ALL.filter((p) => p.id !== 'p9'), nested]);
    expect(r.lines[0].status).toBe('invalid_options');
  });

  it('a sold-out or excluded dish makes the combo unavailable', () => {
    const swap = (cola: Product) => ALL.map((p) => (p.id === 'p2' ? cola : p));
    expect(combo({}, {}, swap({ ...P_COLA, isAvailable: false })).lines[0].status).toBe('unavailable');
    const noDelivery = swap({ ...P_COLA, unavailableModes: ['delivery' as const] });
    expect(combo({}, { mode: 'delivery' }, noDelivery).lines[0].status).toBe('unavailable');
    expect(combo({}, { mode: 'collection' }, noDelivery).lines[0].status).toBe('ok');
    expect(combo({}, {}, ALL.filter((p) => p.id !== 'p2')).lines[0].status).toBe('unavailable');
  });

  it('a changed combo price is flagged', () => {
    expect(combo({ expectedUnitPriceCents: 1100 }).lines[0]).toMatchObject({ status: 'price_changed', unitPriceCents: 1200 });
  });

  it('combo choices must be well formed', () => {
    const msg = 'items[0].comboChoices must list one choice (groupId and productId) per combo group';
    const eleven = Array.from({ length: 11 }, () => COMBO_CHOICES[0]);
    for (const comboChoices of [[], 'x', [{ groupId: 'g-main' }], [{ groupId: 'g-main', productId: 'p1', selectedAddonOptionIds: [1] }], eleven]) {
      expect(validateBasketItems([{ productId: 'p9', quantity: 1, comboChoices }])).toBe(msg);
    }
    expect(validateBasketItems([{ productId: 'p9', quantity: 1, comboChoices: COMBO_CHOICES }])).toBeNull();
  });

  it('names every product the basket needs', () => {
    expect(basketProductIds([{ productId: 'p1', quantity: 1 }, { productId: 'p9', quantity: 1, comboChoices: COMBO_CHOICES }])).toEqual(['p1', 'p9', 'p1', 'p2']);
  });
});
