import { describe, expect, it } from 'vitest';
import { MAX_PRODUCT_PRICE_CENTS, isValidPriceCents } from '../../src/domain/product/price';

describe('isValidPriceCents', () => {
  it('has the same ceiling as a combo price', () => {
    expect(MAX_PRODUCT_PRICE_CENTS).toBe(100000);
  });

  it.each([0, 900, 100000])('accepts %s', (value) => {
    expect(isValidPriceCents(value)).toBe(true);
  });

  it.each([12.5, NaN, Infinity, -3, -0.5, 'abc', null, undefined, 100001])('rejects %s', (value) => {
    expect(isValidPriceCents(value)).toBe(false);
  });
});
