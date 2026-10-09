import { chargesTotalCents } from './delivery';
import type { OrderCharge, OrderDiscount, OrderDiscountKind, OrderItem, TaxBreakdownEntry } from './Order';
import { buildTaxBreakdownWithCharges, extractVatCents, roundHalfUp } from './tax';
import { MIN_CHARGE_CENTS, type DiscountCode } from '../promotion/promotions';

export interface DiscountOffer {
  kind: OrderDiscountKind;
  code: string;
  cents: number;
}

export interface DiscountedBasket {
  items: OrderItem[]; // same order; lines with a share > 0 gain discountCents
  discount: OrderDiscount;
  taxBreakdown: TaxBreakdownEntry[]; // dishes + charges at list price, minus discount.byRate
  totalCents: number; // subtotal + charges - discount
}

/** The code's discount on this subtotal, before the cap. */
export function discountCentsFor(code: Pick<DiscountCode, 'kind' | 'percent' | 'amountCents'>, subtotalCents: number): number {
  return code.kind === 'percent' ? roundHalfUp(subtotalCents * (code.percent ?? 0), 100) : code.amountCents ?? 0;
}

/** Never more than the dishes, and the card is always charged at least MIN_CHARGE_CENTS. */
export function capDiscount(rawCents: number, subtotalCents: number, chargesCents: number): number {
  return Math.max(0, Math.min(rawCents, subtotalCents, subtotalCents + chargesCents - MIN_CHARGE_CENTS));
}

/** Splits `amount` over the weights in proportion (index-aligned); leftover cents to the largest fractions, ties by index. */
export function allocateByWeight(weights: readonly number[], amount: number): number[] {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (total === 0 || amount <= 0) return weights.map(() => 0);
  const parts = weights.map((w, i) => {
    const p = amount * Math.max(0, w);
    return { i, base: Math.floor(p / total), fraction: p % total };
  });
  let left = amount - parts.reduce((s, p) => s + p.base, 0);
  for (const p of [...parts].sort((a, b) => b.fraction - a.fraction || a.i - b.i)) {
    if (left <= 0) break;
    if (p.fraction > 0) {
      p.base += 1;
      left -= 1;
    }
  }
  return parts.map((p) => p.base);
}

/** Applies a resolved discount to priced lines and charges. `offer.cents` must already be capped. */
export function applyDiscount(items: readonly OrderItem[], charges: readonly OrderCharge[], offer: DiscountOffer): DiscountedBasket {
  const shares = allocateByWeight(items.map((i) => i.lineTotalCents), offer.cents);
  const out = items.map((item, k) => (shares[k] > 0 ? { ...item, discountCents: shares[k] } : item));
  const byRateMap = new Map<number, number>();
  out.forEach((item) => {
    if (item.discountCents) {
      const r = item.taxRateBasisPoints ?? 0;
      byRateMap.set(r, (byRateMap.get(r) ?? 0) + item.discountCents);
    }
  });
  const byRate: TaxBreakdownEntry[] = [...byRateMap]
    .sort((a, b) => a[0] - b[0])
    .map(([rateBasisPoints, grossCents]) => ({ rateBasisPoints, grossCents, taxCents: extractVatCents(grossCents, rateBasisPoints) }));
  const taxBreakdown = buildTaxBreakdownWithCharges(out, [...charges]).map((e) => {
    const d = byRate.find((b) => b.rateBasisPoints === e.rateBasisPoints);
    return d ? { rateBasisPoints: e.rateBasisPoints, grossCents: e.grossCents - d.grossCents, taxCents: e.taxCents - d.taxCents } : e;
  });
  const subtotal = out.reduce((s, i) => s + i.lineTotalCents, 0);
  return {
    items: out,
    discount: { kind: offer.kind, code: offer.code, cents: offer.cents, byRate },
    taxBreakdown,
    totalCents: subtotal + chargesTotalCents([...charges]) - offer.cents,
  };
}

/** What the diner paid for `count` units of a line after `from` were already refunded. */
export function paidCentsForUnits(
  item: Pick<OrderItem, 'quantity' | 'unitPriceCents'> & Partial<Pick<OrderItem, 'lineTotalCents' | 'discountCents'>>,
  from: number,
  count: number,
): number {
  if (!item.discountCents) return item.unitPriceCents * count;
  const paid = (item.lineTotalCents ?? item.unitPriceCents * item.quantity) - item.discountCents;
  const p = (k: number) => Math.floor((paid * k) / item.quantity);
  return p(from + count) - p(from);
}
