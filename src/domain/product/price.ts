/**
 * §2: money is whole cents. A dish's base price is an integer count of cents -
 * 0 only for a genuinely free dish - up to the same ceiling a combo price uses
 * (MAX_COMBO_PRICE_CENTS in ./combo).
 */
export const MAX_PRODUCT_PRICE_CENTS = 100000;

export const PRODUCT_PRICE_ERROR = 'price must be a whole number of cents from 0 to 100000';

/** True when `value` is a whole number of cents in range (rejects NaN, Infinity, fractions, strings). */
export function isValidPriceCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_PRODUCT_PRICE_CENTS;
}
