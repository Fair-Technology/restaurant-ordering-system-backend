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
    expect(product.variants).toEqual([{ id: 'g1', name: 'Size', options: [{ id: 'o1', name: 'Klein', priceDelta: 0, isAvailable: true, allergens: [], additives: [], category: null }] }]);
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

  it('carries ageRestricted per dish and defaults to false when absent', () => {
    const p3: Product = { ...p1, id: 'p3', name: 'Fassbier', ageRestricted: true };
    const products = buildCatalog({ shop, categories: [category], products: [p1, p3], refs: DE_REFERENCE_LISTS, lang: 'de', now })
      .categories[0].products;
    expect(products.find((p) => p.id === 'p3')?.ageRestricted).toBe(true);
    expect(products.find((p) => p.id === 'p1')?.ageRestricted).toBe(false);
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

  it('group names are shown in the diner language', () => {
    const tr: Product = {
      ...menu,
      combo: { ...menu.combo!, groups: [{ ...menu.combo!.groups[0], nameTranslations: { en: 'Main course' } }, menu.combo!.groups[1]] },
    };
    const groupNames = (lang: 'de' | 'en') =>
      buildCatalog({ shop, categories: [category], products: [dishA, dishB, tr], refs: DE_REFERENCE_LISTS, lang, now })
        .categories[0].products.find((p) => p.id === 'm1')!.combo!.groups.map((g) => g.name);
    expect(groupNames('en')).toEqual(['Main course', 'Getränk']);
    expect(groupNames('de')).toEqual(['Hauptgericht', 'Getränk']);
  });

  it('a combo with an empty choice is not on the menu', () => {
    expect(build([dishA, { ...dishB, isAvailable: false }, menu]).map((p) => p.id)).not.toContain('m1');
    expect(build([dishA, { ...dishB, categoryIds: ['c-gone'] }, menu]).map((p) => p.id)).not.toContain('m1');
  });

  it('labels what each option adds, in the diner language', () => {
    const result = buildCatalog({
      shop,
      categories: [category],
      products: [{
        ...p1,
        addonGroups: [{ id: 'a1', name: 'Extras', nameTranslations: {}, minSelectable: 0, maxSelectable: 2, options: [{ id: 'x1', name: 'Thunfisch', priceDelta: 150, isAvailable: true, allergenIds: ['fish'], additiveIds: ['preservative'], category: 'Protein' }] }],
        variantGroups: [{ id: 'g1', name: 'Rand', options: [{ id: 'o1', name: 'Käserand', priceDelta: 200, isAvailable: true, allergenIds: ['milk'], additiveIds: [] }] }],
      }],
      refs: DE_REFERENCE_LISTS,
      lang: 'de',
      now,
    });
    const product = result.categories[0].products[0];
    expect(product.addons[0].options[0]).toEqual({ id: 'x1', name: 'Thunfisch', priceDelta: 150, isAvailable: true, allergens: [{ id: 'fish', label: 'Fisch' }], additives: [{ id: 'preservative', code: 2, label: 'mit Konservierungsstoff' }], category: 'Protein' });
    expect(product.variants[0].options[0].allergens).toEqual([{ id: 'milk', label: 'Milch (einschließlich Laktose)' }]);
    expect(product.allergens).toEqual([]);
  });

  it("shows a dish window's offer label in the diner language", () => {
    const withLabel = (schedule: Product['schedule']): Product => ({ ...p1, schedule });
    const window = { startDate: '2026-09-01', startTime: '08:00', endTime: '18:00', offerPrice: 250 };
    const labelOf = (p: Product, lang: 'de' | 'en') =>
      buildCatalog({ shop, categories: [category], products: [p], refs: DE_REFERENCE_LISTS, lang, now })
        .categories[0].products[0].offerLabel;

    const translated = withLabel({ ...window, offerLabel: 'Angebot des Tages', offerLabelTranslations: { en: "Today's special" } });
    expect(labelOf(translated, 'en')).toBe("Today's special");
    expect(labelOf(translated, 'de')).toBe('Angebot des Tages');

    const untranslated = withLabel({ ...window, offerLabel: 'Angebot des Tages' });
    expect(labelOf(untranslated, 'en')).toBe('Angebot des Tages');
    expect(labelOf(untranslated, 'de')).toBe('Angebot des Tages');

    const unlabelled = withLabel({ ...window, offerLabel: null, offerLabelTranslations: { en: "Today's special" } });
    expect(labelOf(unlabelled, 'en')).toBeNull();
    expect(labelOf(withLabel({ ...window }), 'de')).toBeNull();
  });

  it("lists a dish's extras in the order its addonGroups are given", () => {
    const addon = (id: string) => ({
      id,
      name: id,
      minSelectable: 0,
      maxSelectable: 1,
      options: [{ id: `${id}-o`, name: 'O', priceDelta: 0, isAvailable: true }],
    });
    const ordered: Product = { ...p1, addonGroups: [addon('g-zz'), addon('g-aa'), addon('g-mm')] };
    const dto = buildCatalog({ shop, categories: [category], products: [ordered], refs: DE_REFERENCE_LISTS, lang: 'en', now });
    expect(dto.categories[0].products[0].addons.map((a) => a.id)).toEqual(['g-zz', 'g-aa', 'g-mm']);
  });
});

describe('buildCatalog dishes before combos', () => {
  const base: Product = { ...p1, allergenIds: [], additiveIds: [], variantGroups: [] };
  const dish = (id: string, name: string, pos?: number): Product => ({
    ...base,
    id,
    name,
    nameTranslations: {},
    ...(pos === undefined ? {} : { categoryOrder: { c1: pos } }),
  });
  const combo = (id: string, name: string, pos?: number): Product => ({
    ...dish(id, name, pos),
    combo: { groups: [{ id: 'g', name: 'G', productIds: ['d1'] }], bmfDrinkShare: false },
  });
  const ids = (products: Product[]) =>
    buildCatalog({ shop, categories: [category], products, refs: DE_REFERENCE_LISTS, lang: 'de', now }).categories[0].products.map((p) => p.id);

  it('every dish precedes every combo, whatever the names or positions', () => {
    expect(
      ids([combo('m1', 'Aaa Menü'), dish('d2', 'Zebra'), combo('m2', 'Bbb Menü', 0), dish('d1', 'Yak', 5), dish('d3', 'Xylo')]),
    ).toEqual(['d1', 'd3', 'd2', 'm2', 'm1']);
  });

  it('a never-reordered category: dishes by name, then combos by name', () => {
    expect(ids([combo('m2', 'Zz'), dish('d2', 'Zebra'), combo('m1', 'Aa'), dish('d1', 'Apfel')])).toEqual(['d1', 'd2', 'm1', 'm2']);
  });

  it('combos rank by their own categoryOrder, unordered ones trailing by name', () => {
    expect(
      ids([dish('d1', 'Dish'), combo('m3', 'Aaa'), combo('m1', 'Zzz', 0), combo('m2', 'Mmm', 1), combo('m4', 'Bbb')]),
    ).toEqual(['d1', 'm1', 'm2', 'm3', 'm4']);
  });

  it("a combo's lower position never jumps ahead of a dish", () => {
    expect(ids([dish('d1', 'Dish', 9), combo('m1', 'Menü', 0)])).toEqual(['d1', 'm1']);
  });

  describe('at a chosen moment and other times', () => {
    // now = Friday 12:00 Berlin; SAT_NOON = Saturday 11:00 Berlin
    const SAT = new Date('2026-09-26T09:00:00Z');
    const run = (over: { categories?: Category[]; products?: Product[]; at?: Date; now?: Date }) =>
      buildCatalog({
        shop,
        categories: over.categories ?? [category],
        products: over.products ?? [p1],
        refs: DE_REFERENCE_LISTS,
        lang: 'de',
        now: over.now ?? now,
        at: over.at,
      });
    const satCategory: Category = {
      ...category,
      schedule: { daysOfWeek: [6], startTime: '10:00', endTime: '14:00' },
    };
    const satDish: Product = {
      ...p1,
      id: 'sat',
      name: 'Samstagsbraten',
      schedule: { startDate: '2026-09-01', daysOfWeek: [6], startTime: '10:00', endTime: '14:00', offerPrice: 250 },
    };

    it('without at the result is the same as with at = now', () => {
      expect(run({ products: [p1, satDish], categories: [satCategory] })).toEqual(
        run({ products: [p1, satDish], categories: [satCategory], at: now }),
      );
    });

    it('a timed category inactive now is available at a moment inside its window', () => {
      expect(run({ categories: [satCategory] }).categories[0].availableNow).toBe(false);
      const at = run({ categories: [satCategory], at: SAT }).categories[0];
      expect(at.availableNow).toBe(true);
      expect(at.products[0].availableNow).toBe(true);
    });

    it('a scheduled dish excluded now appears at a moment inside its schedule, with its offer', () => {
      expect(run({ products: [satDish] }).categories[0].products).toEqual([]);
      const dish = run({ products: [satDish], at: SAT }).categories[0].products[0];
      expect(dish.id).toBe('sat');
      expect(dish.price).toBe(350);
    });

    it('a combo whose only dish is available at the chosen moment resolves', () => {
      const combo: Product = {
        ...p1,
        id: 'cmb',
        name: 'Menü',
        combo: { groups: [{ id: 'g', name: 'Wahl', productIds: ['sat'] }], bmfDrinkShare: false },
      } as Product;
      const now0 = run({ products: [satDish, combo] }).categories[0].products;
      expect(now0.map((p) => p.id)).toEqual([]); // no dish -> combo not offered
      const at = run({ products: [satDish, combo], at: SAT }).categories[0].products;
      expect(at.find((p) => p.id === 'cmb')?.combo?.groups[0].productIds).toEqual(['sat']);
    });

    it('lists a scheduled dish not served now under otherTimeDishes, with its normal price', () => {
      const res = run({ products: [p1, satDish] });
      expect(res.otherTimeDishes).toEqual([
        {
          id: 'sat',
          name: 'Samstagsbraten',
          price: 350,
          schedule: { startDate: '2026-09-01', endDate: null, daysOfWeek: [6], startTime: '10:00', endTime: '14:00' },
        },
      ]);
      expect(res.categories[0].products.map((p) => p.id)).toEqual(['p1']); // never orderable from there
    });

    it('otherTimeDishes ignores at: it is judged from the real now', () => {
      expect(run({ products: [satDish], at: SAT }).otherTimeDishes.map((p) => p.id)).toEqual(['sat']);
    });

    it('does not list a dish served right now', () => {
      expect(run({ products: [satDish], now: SAT }).otherTimeDishes).toEqual([]);
    });

    it('does not list dishes in a switched-off or deleted category', () => {
      expect(run({ categories: [{ ...category, isAvailable: false }], products: [satDish] }).otherTimeDishes).toEqual([]);
      expect(run({ categories: [{ ...category, isDeleted: true }], products: [satDish] }).otherTimeDishes).toEqual([]);
    });

    it('does not list a switched-off, deleted or undeclared dish', () => {
      expect(run({ products: [{ ...satDish, isAvailable: false }] }).otherTimeDishes).toEqual([]);
      expect(run({ products: [{ ...satDish, isDeleted: true }] }).otherTimeDishes).toEqual([]);
      expect(run({ products: [{ ...satDish, allergenIds: null }] }).otherTimeDishes).toEqual([]);
    });

    it('does not list a dish whose date range has ended', () => {
      const ended: Product = { ...satDish, schedule: { ...satDish.schedule!, endDate: '2026-09-24' } };
      expect(run({ products: [ended] }).otherTimeDishes).toEqual([]);
      const lastDay: Product = { ...satDish, schedule: { ...satDish.schedule!, endDate: '2026-09-25' } };
      expect(run({ products: [lastDay] }).otherTimeDishes.map((p) => p.id)).toEqual(['sat']);
    });

    it('judges the schedule in the shop time zone across a DST change', () => {
      // 25 Oct 2026 (Berlin back to winter time): 23:30Z on the 24th is already 00:30 on Sunday the 25th local
      const sunDish: Product = { ...satDish, schedule: { startDate: '2026-09-01', daysOfWeek: [0] } };
      const at = new Date('2026-10-24T23:30:00Z');
      expect(run({ products: [sunDish], at }).categories[0].products.map((p) => p.id)).toEqual(['sat']);
      expect(run({ products: [sunDish], at: new Date('2026-10-24T21:30:00Z') }).categories[0].products).toEqual([]);
    });
  });
});
