import { REFUND_ITEMS_ERROR, refundQuantityError } from './orderErrors';
import type { OrderItem, RefundLine, TaxBreakdownEntry } from './Order';
import { paidCentsForUnits } from './discount';

export interface RateAmount {
  rateBasisPoints: number;
  grossCents: number;
}

/** What earlier refunds are replayed from: the amount, plus the ticked lines for item refunds. */
export interface RefundShape {
  amountCents: number;
  lines?: ReadonlyArray<RefundLine>;
}

function byRateAsc(a: RateAmount, b: RateAmount): number {
  return a.rateBasisPoints - b.rateBasisPoints;
}

/**
 * Splits a free-amount refund across VAT rates in proportion to what is still unrefunded at each rate.
 * Whole cents only: the parts always add up to the amount; the cents left over go to the biggest
 * fractional shares first (ties keep the order given, which is rate order for callers' data).
 */
export function allocateByRate(remaining: ReadonlyArray<RateAmount>, amountCents: number): RateAmount[] {
  const entries = remaining.filter((r) => r.grossCents > 0);
  const total = entries.reduce((sum, r) => sum + r.grossCents, 0);
  if (total === 0 || amountCents <= 0) return [];
  const shares = entries.map((r, position) => {
    const product = amountCents * r.grossCents;
    return { r, position, base: Math.floor(product / total), fraction: product % total };
  });
  let leftover = amountCents - shares.reduce((sum, s) => sum + s.base, 0);
  const byFraction = [...shares].sort((a, b) => b.fraction - a.fraction || a.position - b.position);
  for (const s of byFraction) {
    if (leftover <= 0) break;
    s.base += 1;
    leftover -= 1;
  }
  return shares
    .map((s) => ({ rateBasisPoints: s.r.rateBasisPoints, grossCents: s.base }))
    .filter((p) => p.grossCents > 0)
    .sort(byRateAsc);
}

/** Gross per VAT rate of the original order (positive amounts only), rate ascending. */
export function baseByRate(breakdown: ReadonlyArray<TaxBreakdownEntry>): RateAmount[] {
  return breakdown
    .filter((e) => e.grossCents > 0)
    .map((e) => ({ rateBasisPoints: e.rateBasisPoints, grossCents: e.grossCents }))
    .sort(byRateAsc);
}

function linePartsByRate(lines: ReadonlyArray<RefundLine>): RateAmount[] {
  const byRate = new Map<number, number>();
  for (const l of lines) byRate.set(l.taxRateBasisPoints, (byRate.get(l.taxRateBasisPoints) ?? 0) + l.grossCents);
  return [...byRate].map(([rateBasisPoints, grossCents]) => ({ rateBasisPoints, grossCents })).sort(byRateAsc);
}

function subtract(remaining: Map<number, number>, parts: ReadonlyArray<RateAmount>): void {
  for (const p of parts) remaining.set(p.rateBasisPoints, (remaining.get(p.rateBasisPoints) ?? 0) - p.grossCents);
}

function asAmounts(remaining: Map<number, number>): RateAmount[] {
  return [...remaining].map(([rateBasisPoints, grossCents]) => ({ rateBasisPoints, grossCents })).sort(byRateAsc);
}

/**
 * The split of refund number `index` across VAT rates. Replays every refund in order from the original
 * amounts: item refunds take their own lines' rates; free amounts take a proportional share of what is left.
 */
export function refundPartsByRate(
  base: ReadonlyArray<RateAmount>,
  refunds: ReadonlyArray<RefundShape>,
  index: number,
): RateAmount[] {
  const remaining = new Map(base.map((b) => [b.rateBasisPoints, b.grossCents]));
  let parts: RateAmount[] = [];
  for (let k = 0; k <= index && k < refunds.length; k++) {
    const refund = refunds[k];
    parts = refund.lines ? linePartsByRate(refund.lines) : allocateByRate(asAmounts(remaining), refund.amountCents);
    if (k < index) subtract(remaining, parts);
  }
  return parts;
}

/** The original amounts minus every refund's parts, per rate, rate ascending. */
export function remainingByRate(base: ReadonlyArray<RateAmount>, refunds: ReadonlyArray<RefundShape>): RateAmount[] {
  const remaining = new Map(base.map((b) => [b.rateBasisPoints, b.grossCents]));
  for (let k = 0; k < refunds.length; k++) subtract(remaining, refundPartsByRate(base, refunds, k));
  return asAmounts(remaining);
}

/** Per order line, how many units earlier item refunds have already covered. */
export function refundedQuantities(lineCount: number, refunds: ReadonlyArray<RefundShape>): number[] {
  const out = new Array<number>(lineCount).fill(0);
  for (const refund of refunds) {
    for (const l of refund.lines ?? []) {
      if (l.lineIndex >= 0 && l.lineIndex < lineCount) out[l.lineIndex] += l.quantity;
    }
  }
  return out;
}

/** Checks a ticked-items request and prices it: a list of refund lines, or an error message. */
export function buildItemRefundLines(
  items: ReadonlyArray<
    Pick<OrderItem, 'quantity' | 'unitPriceCents' | 'taxRateBasisPoints'> & Partial<Pick<OrderItem, 'lineTotalCents' | 'discountCents'>>
  >,
  refunds: ReadonlyArray<RefundShape>,
  request: unknown,
): RefundLine[] | string {
  if (!Array.isArray(request) || request.length === 0) return REFUND_ITEMS_ERROR;
  const seen = new Set<number>();
  const picked: Array<{ lineIndex: number; quantity: number }> = [];
  for (const entry of request as unknown[]) {
    if (typeof entry !== 'object' || entry === null) return REFUND_ITEMS_ERROR;
    const { lineIndex, quantity } = entry as { lineIndex?: unknown; quantity?: unknown };
    if (typeof lineIndex !== 'number' || !Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= items.length) {
      return REFUND_ITEMS_ERROR;
    }
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) return REFUND_ITEMS_ERROR;
    if (seen.has(lineIndex)) return REFUND_ITEMS_ERROR;
    seen.add(lineIndex);
    picked.push({ lineIndex, quantity });
  }
  const already = refundedQuantities(items.length, refunds);
  picked.sort((a, b) => a.lineIndex - b.lineIndex);
  const lines: RefundLine[] = [];
  for (const { lineIndex, quantity } of picked) {
    const left = items[lineIndex].quantity - already[lineIndex];
    if (quantity > left) return refundQuantityError(lineIndex, Math.max(0, left));
    lines.push({
      lineIndex,
      quantity,
      grossCents: paidCentsForUnits(items[lineIndex], already[lineIndex], quantity),
      taxRateBasisPoints: items[lineIndex].taxRateBasisPoints ?? 0,
    });
  }
  return lines;
}
