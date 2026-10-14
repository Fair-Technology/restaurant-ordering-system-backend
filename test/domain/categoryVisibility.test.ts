import { describe, expect, it } from 'vitest';
import { isCategoryLive, parseCategorySchedule, type Category } from '../../src/domain/category/Category';
import { buildCatalog } from '../../src/application/category/getCatalog/buildCatalog';
import { lineIsTimed, lineServedAt, priceBasket } from '../../src/application/order/_shared/priceBasket';
import { DE_REFERENCE_LISTS } from '../../src/domain/reference/ReferenceLists';
import type { Product } from '../../src/domain/product/Product';
import { CATEGORIES, COMBO_CHOICES, NOW_OPEN, P_COLA, P_COMBO, P_PASTA, P_SALAD } from '../fixtures/orders';

// NOW_OPEN is Monday 5 October 2026, 12:00 in Berlin
const TZ = 'Europe/Berlin';
const SHOP = { timezone: TZ, menuLanguages: ['de' as const], countryCode: 'DE' };
const LUNCH = { daysOfWeek: [1, 2, 3, 4, 5], startTime: '11:30', endTime: '14:30' };

const withCategory = (id: string, patch: Partial<Category>): Category[] =>
  CATEGORIES.map((c) => (c.id === id ? { ...c, ...patch } : c));

function price(categories: Category[], items: Parameters<typeof priceBasket>[0]['items'], products: Product[]) {
  return priceBasket({
    items,
    products: new Map(products.map((p) => [p.id, p])),
    categories,
    refs: DE_REFERENCE_LISTS,
    shop: SHOP,
    mode: 'collection',
    now: NOW_OPEN,
    language: 'de',
  });
}

function catalog(categories: Category[], products: Product[]) {
  return buildCatalog({ shop: SHOP, categories, products, refs: DE_REFERENCE_LISTS, lang: 'de', now: NOW_OPEN });
}

describe('parseCategorySchedule', () => {
  it('accepts a weekday lunch window and sorts the days', () => {
    expect(parseCategorySchedule({ ...LUNCH, daysOfWeek: [5, 1, 1] })).toEqual({ ...LUNCH, daysOfWeek: [1, 5] });
  });
  it('null clears it', () => {
    expect(parseCategorySchedule(null)).toBeNull();
  });
  it.each([
    [{ ...LUNCH, daysOfWeek: [] }, 'daysOfWeek'],
    [{ ...LUNCH, daysOfWeek: [7] }, 'daysOfWeek'],
    [{ ...LUNCH, startTime: '25:00' }, 'startTime'],
    [{ ...LUNCH, endTime: '11:30' }, 'after'],
    ['lunch', 'object'],
  ])('refuses %j', (input, problem) => {
    expect(parseCategorySchedule(input)).toContain(problem);
  });
});

describe('isCategoryLive', () => {
  const base = { isDeleted: false };
  it('a category made before the switch existed is on', () => {
    expect(isCategoryLive(base, TZ, NOW_OPEN)).toBe(true);
  });
  it('switched off is not live', () => {
    expect(isCategoryLive({ ...base, isAvailable: false }, TZ, NOW_OPEN)).toBe(false);
  });
  it('inside its times on a listed day is live, in the shop time zone', () => {
    expect(isCategoryLive({ ...base, schedule: LUNCH }, TZ, NOW_OPEN)).toBe(true);
  });
  it('before the start, at the end time and on an unlisted day it is not', () => {
    expect(isCategoryLive({ ...base, schedule: { ...LUNCH, startTime: '12:01' } }, TZ, NOW_OPEN)).toBe(false);
    expect(isCategoryLive({ ...base, schedule: { ...LUNCH, endTime: '12:00' } }, TZ, NOW_OPEN)).toBe(false);
    expect(isCategoryLive({ ...base, schedule: { ...LUNCH, daysOfWeek: [0, 6] } }, TZ, NOW_OPEN)).toBe(false);
  });
});

describe('a switched-off or out-of-hours category on the storefront', () => {
  const products = [P_PASTA, P_COLA, P_SALAD, P_COMBO];

  it('is left out of the catalog', () => {
    const ids = catalog(withCategory('drinks', { isAvailable: false }), products).categories.map((c) => c.id);
    expect(ids).toEqual(['pasta']);
  });

  it('outside its times it is still listed, marked not available now, with its times', () => {
    const late = { ...LUNCH, startTime: '17:00', endTime: '22:00' };
    const out = catalog(withCategory('drinks', { schedule: late }), products);
    expect(out.categories.map((c) => [c.id, c.availableNow, c.schedule])).toEqual([
      ['pasta', true, null],
      ['drinks', false, late],
    ]);
    expect(out.categories.find((c) => c.id === 'drinks')!.products.map((p) => [p.id, p.availableNow])).toEqual([['p2', false]]);
    const inside = catalog(withCategory('drinks', { schedule: LUNCH }), products);
    expect(inside.categories.map((c) => [c.id, c.availableNow])).toEqual([
      ['pasta', true],
      ['drinks', true],
    ]);
  });

  it('a deleted category, and a deleted or off-menu dish in a closed category, never reach the storefront', () => {
    const late = { ...LUNCH, startTime: '17:00', endTime: '22:00' };
    const gone = catalog(withCategory('drinks', { isDeleted: true, schedule: late }), products);
    expect(gone.categories.map((c) => c.id)).toEqual(['pasta']);
    const hidden = [{ ...P_COLA, isDeleted: true }, { ...P_SALAD, categoryIds: ['drinks'], isAvailable: false }];
    const out = catalog(withCategory('drinks', { schedule: late }), [P_PASTA, ...hidden]);
    expect(out.categories.find((c) => c.id === 'drinks')!.products).toEqual([]);
  });

  it('a dish also in a live category is available now under a later category too', () => {
    const late = { ...LUNCH, startTime: '17:00', endTime: '22:00' };
    const both = { ...P_COLA, categoryIds: ['drinks', 'pasta'] };
    const drinks = catalog(withCategory('drinks', { schedule: late }), [P_PASTA, both]).categories.find((c) => c.id === 'drinks')!;
    expect(drinks.availableNow).toBe(false);
    expect(drinks.products.map((p) => [p.id, p.availableNow])).toEqual([['p2', true]]);
  });

  it('a combo does not offer a dish whose category is outside its times', () => {
    const late = { ...LUNCH, startTime: '17:00', endTime: '22:00' };
    const pasta = catalog(withCategory('drinks', { schedule: late }), products).categories.find((c) => c.id === 'pasta')!;
    expect(pasta.products.map((p) => p.id)).not.toContain(P_COMBO.id);
  });

  it('hides a combo whose only drink is in the switched-off category', () => {
    const pasta = catalog(withCategory('drinks', { isAvailable: false }), products).categories.find((c) => c.id === 'pasta')!;
    expect(pasta.products.map((p) => p.id)).not.toContain(P_COMBO.id);
  });

  it('a combo stops offering a dish whose category is off but keeps its other choices', () => {
    const pizza = { ...CATEGORIES[0], id: 'pizza', isAvailable: false };
    const pizzaDish = { ...P_SALAD, categoryIds: ['pizza'] };
    const pasta = catalog([...CATEGORIES, pizza], [P_PASTA, P_COLA, pizzaDish, P_COMBO]).categories.find((c) => c.id === 'pasta')!;
    const combo = pasta.products.find((p) => p.id === P_COMBO.id)!;
    expect(combo.combo!.groups.find((g) => g.id === 'g-main')!.productIds).toEqual(['p1']);
  });

  it('refuses to sell its dish', () => {
    const r = price(withCategory('drinks', { isAvailable: false }), [{ productId: 'p2', quantity: 1 }], products);
    expect(r.lines[0].status).toBe('unavailable');
  });

  it('refuses a combo with a dish from it', () => {
    const r = price(
      withCategory('drinks', { isAvailable: false }),
      [{ productId: P_COMBO.id, quantity: 1, comboChoices: COMBO_CHOICES }],
      products,
    );
    expect(r.lines[0].status).toBe('unavailable');
  });

  it('still sells a dish that also sits in a live category', () => {
    const both = { ...P_COLA, categoryIds: ['drinks', 'pasta'] };
    const r = price(withCategory('drinks', { isAvailable: false }), [{ productId: 'p2', quantity: 1 }], [both]);
    expect(r.lines[0].status).toBe('ok');
  });
});

describe('pricing without judging times', () => {
  const LATE = { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: '17:00', endTime: '22:00' };
  const products = [P_PASTA, P_COLA, P_SALAD, P_COMBO];
  const map = new Map([P_PASTA, P_COLA, P_COMBO].map((p) => [p.id, p]));
  const cats = withCategory('drinks', { schedule: LATE });

  it('ignoring times, a dish outside its category times is priced; a switched-off one still is not', () => {
    const args = { items: [{ productId: 'p2', quantity: 1 }], products: new Map(products.map((p) => [p.id, p])), refs: DE_REFERENCE_LISTS, shop: SHOP, mode: 'collection' as const, now: NOW_OPEN, language: 'de' as const };
    expect(priceBasket({ ...args, categories: cats, checkTimes: false }).lines[0].status).toBe('ok');
    expect(price(cats, [{ productId: 'p2', quantity: 1 }], products).lines[0].status).toBe('unavailable');
    expect(priceBasket({ ...args, categories: withCategory('drinks', { isAvailable: false }), checkTimes: false }).lines[0].status).toBe('unavailable');
  });

  it('a window is read in shop time across the autumn clock change (Berlin, Sunday 25 October 2026)', () => {
    const sun = { daysOfWeek: [0], startTime: '08:00', endTime: '12:00' };
    const cat = { ...CATEGORIES[1], schedule: sun };
    const item = { productId: 'p2', quantity: 1 };
    const m = new Map([['p2', P_COLA]]);
    const at = (iso: string) => lineServedAt(item, m, [cat], TZ, new Date(iso));
    expect(at('2026-10-25T06:59:00Z')).toBe(false); // 07:59 after the change (UTC+1)
    expect(at('2026-10-25T07:00:00Z')).toBe(true); // 08:00
    expect(at('2026-10-25T10:59:00Z')).toBe(true); // 11:59
    expect(at('2026-10-25T11:00:00Z')).toBe(false); // 12:00, end exclusive
  });

  it('a line is served when its category is inside its times, combo picks included', () => {
    expect(lineServedAt({ productId: 'p2', quantity: 1 }, map, cats, TZ, NOW_OPEN)).toBe(false);
    expect(lineServedAt({ productId: 'p2', quantity: 1 }, map, cats, TZ, new Date('2026-10-05T16:00:00Z'))).toBe(true);
    expect(lineServedAt({ productId: 'p9', quantity: 1, comboChoices: COMBO_CHOICES }, map, cats, TZ, NOW_OPEN)).toBe(false);
    expect(lineIsTimed({ productId: 'p1', quantity: 1 }, map, cats)).toBe(false);
    expect(lineIsTimed({ productId: 'p2', quantity: 1 }, map, cats)).toBe(true);
  });
});
