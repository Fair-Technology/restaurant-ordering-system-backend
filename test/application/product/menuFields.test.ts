import { describe, it, expect } from 'vitest';
import { validateMenuFields, OPTION_ALLERGENS_ERROR, OPTION_ADDITIVES_ERROR, OPTION_PRICE_DELTA_ERROR } from '../../../src/application/product/menuFields';
import { SHOP_OPTION_GROUP_SELECTION_ERROR, SHOP_OPTION_GROUP_MAX_SELECTABLE_ERROR } from '../../../src/domain/optionGroup/ShopOptionGroup';
import { DE_REFERENCE_LISTS } from '../../../src/domain/reference/ReferenceLists';

import { DELIVERY_TAX_CLASS_FOR_DISHES_ERROR, UNAVAILABLE_MODES_ERROR } from '../../../src/domain/order/orderErrors';

const refs = DE_REFERENCE_LISTS;

const libGroup = (id: string, isDeleted = false) =>
  ({ id, shopId: 's', kind: 'variant', name: 'G', minSelectable: 1, maxSelectable: 1, options: [], isDeleted, createdAt: 'x', updatedAt: 'x' }) as any;
const library = new Map([['g1', libGroup('g1')], ['g2', libGroup('g2')], ['gx', libGroup('gx', true)]]);

describe('validateMenuFields optionGroupRefs', () => {
  it('accepts and dedupes valid refs', () => {
    expect(validateMenuFields({ optionGroupRefs: ['g1', 'g2', 'g1'] }, refs, null, library)).toEqual({ optionGroupRefs: ['g1', 'g2'] });
  });
  it('leaves refs absent when not sent', () => {
    expect(validateMenuFields({}, refs, null, library)).toEqual({});
  });
  it('rejects an unknown id', () => {
    expect(validateMenuFields({ optionGroupRefs: ['g1', 'nope'] }, refs, null, library)).toEqual({ error: 'Unknown option group: nope' });
  });
  it('rejects a deleted group', () => {
    expect(validateMenuFields({ optionGroupRefs: ['gx'] }, refs, null, library)).toEqual({ error: 'Unknown option group: gx' });
  });
  it('rejects a non-array', () => {
    expect(validateMenuFields({ optionGroupRefs: 'g1' }, refs, null, library)).toHaveProperty('error');
  });
});

describe('validateMenuFields', () => {
  it('a dish cannot use the Delivery class', () => {
    expect(validateMenuFields({ taxClassId: 'delivery' }, refs, null)).toEqual({ error: DELIVERY_TAX_CLASS_FOR_DISHES_ERROR });
  });

  it('accepts a full declaration', () => {
    const result = validateMenuFields(
      {
        allergenIds: ['milk', 'gluten', 'milk'],
        additiveIds: [],
        dietaryTagIds: ['vegetarian'],
        spiceLevel: 'mild',
        prepMinutes: 15,
        taxClassId: 'beverage',
        nameTranslations: { en: 'Pizza' },
      },
      refs,
      null,
    );
    expect(result).toEqual({
      allergenIds: ['milk', 'gluten'],
      additiveIds: [],
      dietaryTagIds: ['vegetarian'],
      spiceLevel: 'mild',
      prepMinutes: 15,
      taxClassId: 'beverage',
      nameTranslations: { en: 'Pizza' },
    });
  });

  it('leaves absent fields absent', () => {
    expect(validateMenuFields({}, refs, null)).toEqual({});
  });

  it('rejects an unknown allergen', () => {
    expect(validateMenuFields({ allergenIds: ['nuts'] }, refs, null)).toEqual({ error: 'Unknown allergen: nuts' });
  });

  it('treats null as undeclared', () => {
    const result = validateMenuFields({ allergenIds: null, additiveIds: null }, refs, null);
    expect(result).toEqual({ allergenIds: null, additiveIds: null });
  });

  it('rejects zero and fractional prep time', () => {
    expect(validateMenuFields({ prepMinutes: 0 }, refs, null)).toEqual({
      error: 'prepMinutes must be a whole number of minutes between 1 and 240, or null',
    });
    expect(validateMenuFields({ prepMinutes: 12.5 }, refs, null)).toEqual({
      error: 'prepMinutes must be a whole number of minutes between 1 and 240, or null',
    });
  });

  it('rejects an unknown tax class', () => {
    expect(validateMenuFields({ taxClassId: 'alcohol' }, refs, null)).toEqual({ error: 'Unknown tax class: alcohol' });
  });

  it('checks a dietary conflict against existing allergens', () => {
    const result = validateMenuFields(
      { dietaryTagIds: ['vegan'] },
      refs,
      { allergenIds: ['milk'], dietaryTagIds: [] },
    );
    expect(result).toEqual({ error: 'A dish tagged vegan cannot contain the milk allergen' });
  });

  it('normalises option translations', () => {
    const result = validateMenuFields(
      {
        variantGroups: [
          {
            id: 'g1',
            name: 'Größe',
            nameTranslations: { en: ' Size ' },
            options: [{ id: 'o1', name: 'Klein', nameTranslations: { en: '' }, priceDelta: 0, isAvailable: true }],
          },
        ],
      },
      refs,
      null,
    );
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.variantGroups).toEqual([
      {
        id: 'g1',
        name: 'Größe',
        nameTranslations: { en: 'Size' },
        options: [{ id: 'o1', name: 'Klein', nameTranslations: {}, priceDelta: 0, isAvailable: true, allergenIds: [], additiveIds: [] }],
      },
    ]);
  });

  it('reads the modes a dish is not offered for', () => {
    expect(validateMenuFields({ unavailableModes: ['delivery', 'collection', 'delivery'] }, refs, null)).toEqual({
      unavailableModes: ['collection', 'delivery'],
    });
    expect(validateMenuFields({ unavailableModes: ['takeaway'] }, refs, null)).toEqual({ error: UNAVAILABLE_MODES_ERROR });
    expect(validateMenuFields({ unavailableModes: 'delivery' }, refs, null)).toEqual({ error: UNAVAILABLE_MODES_ERROR });
  });
});

describe('validateMenuFields ageRestricted', () => {
  it('accepts a boolean', () => {
    expect(validateMenuFields({ ageRestricted: true }, refs, null)).toEqual({ ageRestricted: true });
    expect(validateMenuFields({ ageRestricted: false }, refs, null)).toEqual({ ageRestricted: false });
  });
  it('leaves it out when not sent and rejects a non-boolean', () => {
    expect(validateMenuFields({}, refs, null)).toEqual({});
    expect(validateMenuFields({ ageRestricted: 'yes' }, refs, null)).toEqual({ error: 'ageRestricted must be a boolean' });
    expect(validateMenuFields({ ageRestricted: 1 }, refs, null)).toEqual({ error: 'ageRestricted must be a boolean' });
    expect(validateMenuFields({ ageRestricted: null }, refs, null)).toEqual({ error: 'ageRestricted must be a boolean' });
  });
});

describe('validateMenuFields option allergens and additives', () => {
  const X = { id: 'x1', name: 'Thunfisch', priceDelta: 150, isAvailable: true };
  const group = (opts: any[]) => ({ id: 'a1', name: 'Extras', minSelectable: 0, maxSelectable: 1, options: opts });
  const ok = (r: any) => {
    expect('error' in r).toBe(false);
    return r;
  };

  it('stores what an extra adds, without repeats', () => {
    const result = ok(validateMenuFields({ addonGroups: [group([{ ...X, allergenIds: ['fish', 'fish'], additiveIds: ['preservative'] }])] }, refs, null));
    expect(result.addonGroups[0].options[0]).toEqual({ ...X, nameTranslations: {}, allergenIds: ['fish'], additiveIds: ['preservative'] });
  });

  it('a size carries its own allergens too', () => {
    const result = ok(validateMenuFields({
      variantGroups: [{ id: 'g1', name: 'Rand', options: [{ id: 'o1', name: 'Käserand', priceDelta: 200, isAvailable: true, allergenIds: ['milk'], additiveIds: [] }] }],
    }, refs, null));
    expect(result.variantGroups[0].options[0].allergenIds).toEqual(['milk']);
  });

  it('an option sent without the lists gets none when it is new', () => {
    const result = ok(validateMenuFields({ addonGroups: [group([X])] }, refs, null));
    expect(result.addonGroups[0].options[0].allergenIds).toEqual([]);
    expect(result.addonGroups[0].options[0].additiveIds).toEqual([]);
  });

  it('an option sent without the lists keeps what it had', () => {
    const existing = { addonGroups: [group([{ ...X, allergenIds: ['fish'], additiveIds: ['preservative'] }])] };
    const result = ok(validateMenuFields({ addonGroups: [group([X])] }, refs, existing));
    expect(result.addonGroups[0].options[0].allergenIds).toEqual(['fish']);
    expect(result.addonGroups[0].options[0].additiveIds).toEqual(['preservative']);
  });

  it("an empty list clears an option's allergens", () => {
    const existing = { addonGroups: [group([{ ...X, allergenIds: ['fish'], additiveIds: ['preservative'] }])] };
    const result = ok(validateMenuFields({ addonGroups: [group([{ ...X, allergenIds: [] }])] }, refs, existing));
    expect(result.addonGroups[0].options[0].allergenIds).toEqual([]);
    expect(result.addonGroups[0].options[0].additiveIds).toEqual(['preservative']);
  });

  it('rejects an unknown allergen or additive on an option', () => {
    expect(validateMenuFields({ addonGroups: [group([{ ...X, allergenIds: ['nuts'] }])] }, refs, null)).toEqual({ error: 'Unknown allergen: nuts' });
    expect(validateMenuFields({ addonGroups: [group([{ ...X, additiveIds: ['msg'] }])] }, refs, null)).toEqual({ error: 'Unknown additive: msg' });
  });

  it('rejects null or a non-list on an option', () => {
    expect(validateMenuFields({ addonGroups: [group([{ ...X, allergenIds: null }])] }, refs, null)).toEqual({ error: OPTION_ALLERGENS_ERROR });
    expect(validateMenuFields({ addonGroups: [group([{ ...X, additiveIds: 'fish' }])] }, refs, null)).toEqual({ error: OPTION_ADDITIVES_ERROR });
  });

  it('an extra with milk does not clash with a vegan dish', () => {
    const result = validateMenuFields({
      dietaryTagIds: ['vegan'], allergenIds: [], additiveIds: [],
      addonGroups: [group([{ ...X, allergenIds: ['milk'] }])],
    }, refs, null);
    expect('error' in result).toBe(false);
  });
});

describe('validateMenuFields inline option group validation', () => {
  const opt = (id: string, priceDelta: unknown) => ({ id, name: `Opt ${id}`, priceDelta, isAvailable: true });
  const variant = (priceDelta: unknown) => ({ variantGroups: [{ id: 'g1', name: 'Size', options: [opt('o1', priceDelta)] }] }) as any;
  const addon = (extra: Record<string, unknown> = {}, options: any[] = [opt('o1', 100), opt('o2', 200)]) =>
    ({ addonGroups: [{ id: 'a1', name: 'Extras', options, ...extra }] }) as any;

  it.each([12.5, -1, '150', 100001, NaN])('rejects priceDelta %p in a variant group', (bad) => {
    expect(validateMenuFields(variant(bad), refs, null)).toEqual({ error: OPTION_PRICE_DELTA_ERROR });
  });
  it.each([12.5, -1, '150', 100001, NaN])('rejects priceDelta %p in an addon group', (bad) => {
    expect(validateMenuFields(addon({}, [opt('o1', bad)]), refs, null)).toEqual({ error: OPTION_PRICE_DELTA_ERROR });
  });
  it.each([0, 900, 100000])('accepts whole priceDelta %p', (good) => {
    expect(validateMenuFields(variant(good), refs, null)).not.toHaveProperty('error');
    expect(validateMenuFields(addon({}, [opt('o1', good)]), refs, null)).not.toHaveProperty('error');
  });

  it.each([
    [0.5, 1],
    [0, 1.5],
    [-1, 1],
    [0, -1],
    [2, 1],
  ])('rejects addon selection %p..%p', (min, max) => {
    expect(validateMenuFields(addon({ minSelectable: min, maxSelectable: max }), refs, null)).toEqual({ error: SHOP_OPTION_GROUP_SELECTION_ERROR });
  });
  it('rejects maxSelectable above the option count', () => {
    expect(validateMenuFields(addon({ minSelectable: 0, maxSelectable: 3 }), refs, null)).toEqual({ error: SHOP_OPTION_GROUP_MAX_SELECTABLE_ERROR });
  });
  it('accepts and stores a valid range', () => {
    const r: any = validateMenuFields(addon({ minSelectable: 0, maxSelectable: 2 }), refs, null);
    expect(r.addonGroups[0]).toMatchObject({ minSelectable: 0, maxSelectable: 2 });
  });
  it('defaults omitted min/max to 0 and the option count and writes them back', () => {
    const r: any = validateMenuFields(addon(), refs, null);
    expect(r.addonGroups[0]).toMatchObject({ minSelectable: 0, maxSelectable: 2 });
  });
});
