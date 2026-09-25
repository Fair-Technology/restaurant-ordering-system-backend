import { describe, it, expect } from 'vitest';
import {
  DE_REFERENCE_LISTS,
  currentTaxRates,
  defaultReferenceLists,
  ratesUniformAcrossModes,
  resolveTaxRateBasisPoints,
  TaxRateRow,
} from '../../src/domain/reference/ReferenceLists';

describe('DE_REFERENCE_LISTS', () => {
  it('has the 14 EU allergens', () => {
    expect(DE_REFERENCE_LISTS.allergens.map((a) => a.id)).toEqual([
      'gluten',
      'crustaceans',
      'eggs',
      'fish',
      'peanuts',
      'soybeans',
      'milk',
      'tree_nuts',
      'celery',
      'mustard',
      'sesame',
      'sulphites',
      'lupin',
      'molluscs',
    ]);
  });

  it('has additives numbered 1 to 13', () => {
    expect(DE_REFERENCE_LISTS.additives.map((a) => a.code)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it('is 7% food / 19% beverage in every mode', () => {
    const at = new Date('2026-09-25T12:00:00Z');
    for (const mode of ['collection', 'delivery', 'dine_in'] as const) {
      expect(resolveTaxRateBasisPoints(DE_REFERENCE_LISTS.taxRates, 'food', mode, at)).toBe(700);
      expect(resolveTaxRateBasisPoints(DE_REFERENCE_LISTS.taxRates, 'beverage', mode, at)).toBe(1900);
    }
  });

  it('has no rate before the first effective date', () => {
    const at = new Date('2025-12-31T22:59:59Z');
    expect(resolveTaxRateBasisPoints(DE_REFERENCE_LISTS.taxRates, 'food', 'collection', at)).toBeNull();
  });

  it('picks the latest effective row', () => {
    const rows: TaxRateRow[] = [
      { taxClassId: 'food', fulfilmentMode: 'dine_in', rateBasisPoints: 1900, effectiveFrom: '2020-01-01T00:00:00+01:00' },
      { taxClassId: 'food', fulfilmentMode: 'dine_in', rateBasisPoints: 700, effectiveFrom: '2026-01-01T00:00:00+01:00' },
    ];
    expect(resolveTaxRateBasisPoints(rows, 'food', 'dine_in', new Date('2025-06-01T00:00:00Z'))).toBe(1900);
    expect(resolveTaxRateBasisPoints(rows, 'food', 'dine_in', new Date('2026-02-01T00:00:00Z'))).toBe(700);
  });

  it('ignores a future row until it starts', () => {
    const rows: TaxRateRow[] = [
      { taxClassId: 'food', fulfilmentMode: 'dine_in', rateBasisPoints: 1900, effectiveFrom: '2020-01-01T00:00:00+01:00' },
      { taxClassId: 'food', fulfilmentMode: 'dine_in', rateBasisPoints: 700, effectiveFrom: '2026-01-01T00:00:00+01:00' },
      { taxClassId: 'food', fulfilmentMode: 'dine_in', rateBasisPoints: 1000, effectiveFrom: '2027-01-01T00:00:00+01:00' },
    ];
    expect(resolveTaxRateBasisPoints(rows, 'food', 'dine_in', new Date('2026-09-25T00:00:00Z'))).toBe(700);
  });

  it('is uniform across modes', () => {
    const at = new Date('2026-09-25T00:00:00Z');
    expect(ratesUniformAcrossModes(currentTaxRates(DE_REFERENCE_LISTS, at))).toBe(true);

    const skewed = structuredClone(DE_REFERENCE_LISTS);
    skewed.taxRates.push({
      taxClassId: 'food',
      fulfilmentMode: 'dine_in',
      rateBasisPoints: 1900,
      effectiveFrom: '2026-06-01T00:00:00+02:00',
    });
    expect(ratesUniformAcrossModes(currentTaxRates(skewed, at))).toBe(false);
  });

  it('gives an unknown country empty lists', () => {
    expect(defaultReferenceLists('au')).toEqual({
      id: 'reference_lists:AU',
      countryCode: 'AU',
      allergens: [],
      additives: [],
      taxClasses: [],
      defaultTaxClassId: null,
      taxRates: [],
      updatedAt: null,
      updatedBy: null,
    });
  });
});
