import { describe, expect, it } from 'vitest';
import { buildTaxBreakdown, effectiveTaxClassId, extractVatCents, roundHalfUp } from '../../src/domain/order/tax';
import { CATEGORIES } from '../fixtures/orders';

describe('order tax', () => {
  it('rounds half up', () => {
    expect(roundHalfUp(5, 10)).toBe(1);
    expect(roundHalfUp(15, 10)).toBe(2);
    expect(roundHalfUp(14, 10)).toBe(1);
    expect(roundHalfUp(0, 10)).toBe(0);
  });

  it('extracts 7% from a 9.00 dish', () => {
    expect(extractVatCents(900, 700)).toBe(59);
  });

  it('extracts 19% from a 3.50 drink', () => {
    expect(extractVatCents(350, 1900)).toBe(56);
  });

  it('zero rate extracts nothing', () => {
    expect(extractVatCents(900, 0)).toBe(0);
  });

  it('per-dish override wins', () => {
    expect(effectiveTaxClassId({ taxClassId: 'beverage', categoryIds: ['pasta'] }, CATEGORIES, 'food')).toBe('beverage');
  });

  it('inherits the first found category', () => {
    expect(effectiveTaxClassId({ taxClassId: null, categoryIds: ['gone', 'drinks', 'pasta'] }, CATEGORIES, 'food')).toBe(
      'beverage',
    );
  });

  it('falls back to the country default', () => {
    expect(effectiveTaxClassId({ taxClassId: null, categoryIds: ['gone'] }, [], 'food')).toBe('food');
  });

  it('breakdown groups lines by rate', () => {
    expect(
      buildTaxBreakdown([
        { lineTotalCents: 1800, taxRateBasisPoints: 700, taxCents: 118 },
        { lineTotalCents: 900, taxRateBasisPoints: 700, taxCents: 59 },
        { lineTotalCents: 350, taxRateBasisPoints: 1900, taxCents: 56 },
      ]),
    ).toEqual([
      { rateBasisPoints: 700, grossCents: 2700, taxCents: 177 },
      { rateBasisPoints: 1900, grossCents: 350, taxCents: 56 },
    ]);
  });
});
