import { describe, it, expect } from 'vitest';
import { validateMenuFields } from '../../../src/application/product/menuFields';
import { DE_REFERENCE_LISTS } from '../../../src/domain/reference/ReferenceLists';

const refs = DE_REFERENCE_LISTS;

describe('validateMenuFields', () => {
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
        options: [{ id: 'o1', name: 'Klein', nameTranslations: {}, priceDelta: 0, isAvailable: true }],
      },
    ]);
  });
});
