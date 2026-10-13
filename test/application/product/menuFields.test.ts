import { describe, it, expect } from 'vitest';
import { validateMenuFields, OPTION_ALLERGENS_ERROR, OPTION_ADDITIVES_ERROR } from '../../../src/application/product/menuFields';
import { DE_REFERENCE_LISTS } from '../../../src/domain/reference/ReferenceLists';

import { DELIVERY_TAX_CLASS_FOR_DISHES_ERROR, UNAVAILABLE_MODES_ERROR } from '../../../src/domain/order/orderErrors';

const refs = DE_REFERENCE_LISTS;

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

describe('validateMenuFields option allergens and additives', () => {
  const X = { id: 'x1', name: 'Thunfisch', priceDelta: 150, isAvailable: true };
  const group = (opts: any[]) => ({ id: 'a1', name: 'Extras', minSelectable: 0, maxSelectable: 2, options: opts });
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
