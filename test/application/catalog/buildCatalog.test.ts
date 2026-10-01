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
});
