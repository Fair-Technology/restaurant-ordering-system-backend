import { describe, it, expect } from 'vitest';
import { legacySpecialInfoToMenuFields } from '../../scripts/menus/legacySpecialInfo';

describe('legacySpecialInfoToMenuFields', () => {
  it('maps known allergen labels, ordered by the platform list', () => {
    expect(
      legacySpecialInfoToMenuFields([{ name: 'Contains Gluten' }, { name: 'Contains Dairy' }, { name: 'Contains Egg' }]),
    ).toEqual({ allergenIds: ['gluten', 'eggs', 'milk'], additiveIds: [], dietaryTagIds: [], spiceLevel: null });
  });

  it('maps a dietary tag and ignores an unknown label', () => {
    expect(legacySpecialInfoToMenuFields([{ name: 'Vegan' }, { name: 'Contains Allergens' }])).toEqual({
      allergenIds: [],
      additiveIds: [],
      dietaryTagIds: ['vegan'],
      spiceLevel: null,
    });
  });

  it('maps spice level and an additive', () => {
    expect(legacySpecialInfoToMenuFields([{ name: 'Spicy' }, { name: 'Contains Caffeine' }])).toEqual({
      allergenIds: [],
      additiveIds: ['caffeine'],
      dietaryTagIds: [],
      spiceLevel: 'medium',
    });
  });
});
