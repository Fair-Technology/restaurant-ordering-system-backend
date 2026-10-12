import { describe, expect, it } from 'vitest';
import { isCategoryLive, parseCategorySchedule, type Category } from '../../src/domain/category/Category';
import { buildCatalog } from '../../src/application/category/getCatalog/buildCatalog';
import { priceBasket } from '../../src/application/order/_shared/priceBasket';
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

  it('outside its times is left out too, and inside them it shows', () => {
    const late = { ...LUNCH, startTime: '17:00', endTime: '22:00' };
    expect(catalog(withCategory('drinks', { schedule: late }), products).categories.map((c) => c.id)).toEqual(['pasta']);
    expect(catalog(withCategory('drinks', { schedule: LUNCH }), products).categories.map((c) => c.id)).toEqual([
      'pasta',
      'drinks',
    ]);
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
