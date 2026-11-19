import type { Order, TaxBreakdownEntry } from '../src/domain/order/Order';
import { chargedCents } from '../src/domain/order/Order';
import { buildTaxBreakdownWithCharges } from '../src/domain/order/tax';

export type TaxBreakdownFix =
  | { kind: 'fix'; before: TaxBreakdownEntry[]; after: TaxBreakdownEntry[]; totalCents: number; beforeGrossCents: number }
  | { kind: 'unfixable'; reason: string };

const sumGross = (b: readonly TaxBreakdownEntry[]): number => b.reduce((s, e) => s + e.grossCents, 0);

/**
 * What checkout would have stored for this order: its dishes and charges per rate, less the discount's share per rate
 * (the same shape applyDiscount produces). Pure.
 */
export function recomputeTaxBreakdown(
  order: Pick<Order, 'items' | 'charges' | 'discount'>,
): TaxBreakdownEntry[] {
  const base = buildTaxBreakdownWithCharges(order.items, order.charges ?? []);
  const byRate = order.discount?.byRate ?? [];
  return base.map((e) => {
    const d = byRate.find((b) => b.rateBasisPoints === e.rateBasisPoints);
    return d
      ? { rateBasisPoints: e.rateBasisPoints, grossCents: e.grossCents - d.grossCents, taxCents: e.taxCents - d.taxCents }
      : e;
  });
}

/**
 * null when the order is fine (no stored breakdown, or its gross already sums to what was charged).
 * Otherwise the corrected breakdown, or 'unfixable' when even the recomputed one does not sum to the charged total —
 * then the order's own items/charges/total disagree and a human has to look.
 * Idempotent: the `after` of a fix is itself a null on the next pass.
 */
export function planTaxBreakdownFix(order: Order): TaxBreakdownFix | null {
  if (!order.taxBreakdown) return null;
  const total = chargedCents(order);
  const beforeGrossCents = sumGross(order.taxBreakdown);
  if (beforeGrossCents === total) return null;
  const after = recomputeTaxBreakdown(order);
  if (sumGross(after) !== total) {
    return { kind: 'unfixable', reason: `recomputed gross ${sumGross(after)} != charged ${total}` };
  }
  return { kind: 'fix', before: order.taxBreakdown, after, totalCents: total, beforeGrossCents };
}
