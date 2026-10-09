import { describe, it, expect } from 'vitest';
import { buildCatalog } from '../../../src/application/category/getCatalog/buildCatalog';
import { DE_REFERENCE_LISTS } from '../../../src/domain/reference/ReferenceLists';
import { Category } from '../../../src/domain/category/Category';
import { Product } from '../../../src/domain/product/Product';
import { MenuLanguage } from '../../../src/domain/reference/ReferenceLists';

const shop = { timezone: 'Europe/Berlin', countryCode: 'DE', menuLanguages: ['de', 'en'] as MenuLanguage[] };

const category: Category = {
  id: 'c1',
  shopId: 'shop-1',
  name: 'Getränke',
  nameTranslations: { en: 'Drinks' },
  sortOrder: 1,
  taxClassId: 'beverage',
  isDeleted: false,
  createdAt: 'x',
  updatedAt: 'x',
};

const p1: Product = {
  id: 'p1',
  shopId: 'shop-1',
  categoryIds: ['c1'],
  name: 'Apfelschorle',
  nameTranslations: { en: 'Apple spritzer' },
  description: 'Hausgemacht',
  descriptionTranslations: {},
  price: 350,
  images: [],
  isAvailable: true,
  isDeleted: false,
  allergenIds: [],
  additiveIds: ['caffeine'],
  dietaryTagIds: ['vegan'],
  spiceLevel: null,
  prepMinutes: null,
  taxClassId: null,
  variantGroups: [
    {
      id: 'g1',
      name: 'Größe',
      nameTranslations: { en: 'Size' },
      options: [{ id: 'o1', name: 'Klein', priceDelta: 0, isAvailable: true }],
    },
  ],
  addonGroups: [],
  schedule: null,
  createdAt: 'x',
  updatedAt: 'x',
};

const p2: Product = { ...p1, id: 'p2', name: 'Geheim', allergenIds: null };

const now = new Date('2026-09-25T10:00:00Z');

describe('buildCatalog', () => {
  it('resolves English with German fallback', () => {
    const result = buildCatalog({
      shop,
      categories: [category],
      products: [p1, p2],
      refs: DE_REFERENCE_LISTS,
      lang: 'en',
      now,
    });

    expect(result.language).toBe('en');
    expect(result.languages).toEqual(['de', 'en']);
    expect(result.categories[0].name).toBe('Drinks');
    expect(result.categories[0].products).toHaveLength(1);
    const product = result.categories[0].products[0];
    expect(product.name).toBe('Apple spritzer');
    expect(product.description).toBe('Hausgemacht');
    expect(product.variants).toEqual([{ id: 'g1', name: 'Size', options: [{ id: 'o1', name: 'Klein', priceDelta: 0, isAvailable: true }] }]);
    expect(product.additives).toEqual([{ id: 'caffeine', code: 11, label: 'contains caffeine' }]);
    expect(product.allergens).toEqual([]);
    expect(product.dietaryTags).toEqual([{ id: 'vegan', label: 'Vegan' }]);
    expect(product.spice).toBeNull();
  });

  it('falls back to the original language', () => {
    const result = buildCatalog({
      shop,
      categories: [category],
      products: [p1],
      refs: DE_REFERENCE_LISTS,
      lang: 'fr',
      now,
    });

    expect(result.language).toBe('de');
    expect(result.categories[0].name).toBe('Getränke');
    expect(result.categories[0].products[0].name).toBe('Apfelschorle');
    expect(result.categories[0].products[0].additives[0].label).toBe('koffeinhaltig');
  });

  it('hides undeclared dishes', () => {
    const result = buildCatalog({
      shop,
      categories: [category],
      products: [p1, p2],
      refs: DE_REFERENCE_LISTS,
      lang: 'de',
      now,
    });

    const ids = result.categories[0].products.map((p) => p.id);
    expect(ids).not.toContain('p2');
  });

  it('shows the offer price only for an offer below the normal price', () => {
    const withOffer = (offerPrice: number | null): Product => ({
      ...p1,
      schedule: { startDate: '2026-09-01', startTime: '08:00', endTime: '18:00', offerPrice, offerLabel: 'Lunch' },
    });
    const offerOf = (p: Product) =>
      buildCatalog({ shop, categories: [category], products: [p], refs: DE_REFERENCE_LISTS, lang: 'de', now })
        .categories[0].products[0].offerPrice;
    expect(offerOf(withOffer(250))).toBe(250);
    expect(offerOf(withOffer(null))).toBeNull();
    expect(offerOf(withOffer(350))).toBeNull();
  });

  it('tells the storefront which modes a dish is not offered for', () => {
    const p3: Product = { ...p1, id: 'p3', name: 'Fassbier', unavailableModes: ['delivery'] };
    const products = buildCatalog({ shop, categories: [category], products: [p1, p3], refs: DE_REFERENCE_LISTS, lang: 'de', now })
      .categories[0].products;
    expect(products.find((p) => p.id === 'p3')?.unavailableModes).toEqual(['delivery']);
    expect(products.find((p) => p.id === 'p1')?.unavailableModes).toEqual([]);
  });
});

describe('buildCatalog combos', () => {
  const dishA: Product = { ...p1, id: 'pa', name: 'Pasta', allergenIds: ['gluten'], additiveIds: [], variantGroups: [] };
  const dishB: Product = { ...p1, id: 'pb', name: 'Cola', allergenIds: ['milk'], additiveIds: ['caffeine'], variantGroups: [] };
  const menu: Product = {
    ...p1,
    id: 'm1',
    name: 'Menü',
    price: 1200,
    allergenIds: [],
    additiveIds: [],
    variantGroups: [],
    combo: {
      groups: [
        { id: 'g1', name: 'Hauptgericht', productIds: ['pa'] },
        { id: 'g2', name: 'Getränk', productIds: ['pb', 'gone'] },
      ],
      bmfDrinkShare: false,
    },
  };
  const build = (products: Product[]) =>
    buildCatalog({ shop, categories: [category], products, refs: DE_REFERENCE_LISTS, lang: 'de', now }).categories[0].products;

  it('a combo lists only dishes on the menu and the union of their allergens', () => {
    const products = build([dishA, dishB, menu]);
    const m = products.find((p) => p.id === 'm1')!;
    expect(m.combo).toEqual({
      groups: [
        { id: 'g1', name: 'Hauptgericht', productIds: ['pa'] },
        { id: 'g2', name: 'Getränk', productIds: ['pb'] },
      ],
    });
    expect(m.allergens.map((a) => a.id)).toEqual(['gluten', 'milk']);
    expect(m.additives).toEqual([{ id: 'caffeine', code: 11, label: 'koffeinhaltig' }]);
    expect(m.price).toBe(1200);
    expect(products.find((p) => p.id === 'pa')!.combo).toBeNull();
  });

  it('a combo with an empty choice is not on the menu', () => {
    expect(build([dishA, { ...dishB, isAvailable: false }, menu]).map((p) => p.id)).not.toContain('m1');
    expect(build([dishA, { ...dishB, categoryIds: ['c-gone'] }, menu]).map((p) => p.id)).not.toContain('m1');
  });
});
