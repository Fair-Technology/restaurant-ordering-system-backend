import type { Category } from '../category/Category';
import type { Product } from '../product/Product';
import type { OrderItem, TaxBreakdownEntry } from './Order';

/** Integer division rounding half up; both inputs non-negative integers. */
export function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/** The VAT contained in a gross price. A rate of 0 or less extracts nothing. */
export function extractVatCents(grossCents: number, rateBasisPoints: number): number {
  if (rateBasisPoints <= 0) return 0;
  return roundHalfUp(grossCents * rateBasisPoints, 10000 + rateBasisPoints);
}

/** Per-dish override, else the first found category (in categoryIds order), else the country default. */
export function effectiveTaxClassId(
  product: Pick<Product, 'taxClassId' | 'categoryIds'>,
  categories: ReadonlyArray<Pick<Category, 'id' | 'taxClassId'>>,
  countryDefault: string | null,
): string | null {
  if (product.taxClassId) return product.taxClassId;
  for (const categoryId of product.categoryIds) {
    const category = categories.find((c) => c.id === categoryId);
    if (category) return category.taxClassId ?? countryDefault;
  }
  return countryDefault;
}

/** Groups lines by rate; lines from before slice 4 (no rate) count as rate 0. Sorted by rate ascending. */
export function buildTaxBreakdown(
  items: ReadonlyArray<Pick<OrderItem, 'lineTotalCents' | 'taxRateBasisPoints' | 'taxCents'>>,
): TaxBreakdownEntry[] {
  const byRate = new Map<number, TaxBreakdownEntry>();
  for (const item of items) {
    const rate = item.taxRateBasisPoints ?? 0;
    const entry = byRate.get(rate) ?? { rateBasisPoints: rate, grossCents: 0, taxCents: 0 };
    entry.grossCents += item.lineTotalCents;
    entry.taxCents += item.taxCents ?? 0;
    byRate.set(rate, entry);
  }
  return [...byRate.values()].sort((a, b) => a.rateBasisPoints - b.rateBasisPoints);
}
