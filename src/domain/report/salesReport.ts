import {
  chargedCents,
  FULFILMENT_MODES,
  type FulfilmentMode,
  type OrderPayment,
  type RefundLine,
  type TaxBreakdownEntry,
} from '../order/Order';
import { isCaptured } from '../order/payment';
import { baseByRate, refundPartsByRate } from '../order/refundAllocation';
import { buildTaxBreakdown, extractVatCents } from '../order/tax';
import { localDate } from '../order/orderTimers';

export const REPORT_MAX_DAYS = 92;
export const TOP_DISHES_COUNT = 10;
export const REPORT_RANGE_ERROR = 'from and to must be dates (YYYY-MM-DD), from not after to, at most 92 days apart';

/** One order line, as the report query selects it. */
export interface ReportItemRow {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  taxRateBasisPoints?: number;
  taxCents?: number;
  discountCents?: number;
}

export interface ReportRefundRow {
  amountCents: number;
  at: string;
  lines?: RefundLine[];
}

/** One order, as the report query selects it: no diner name, email, phone, address or notes. */
export interface ReportOrderRow {
  id: string;
  createdAt: string;
  acceptedAt?: string;
  scheduledFor?: string;
  fulfilmentMode: FulfilmentMode;
  payment: OrderPayment;
  subtotalCents: number;
  totalCents?: number;
  charges?: Array<{ kind: string; grossCents: number }>;
  discountCents?: number;
  taxBreakdown?: TaxBreakdownEntry[];
  items: ReportItemRow[];
  refunds?: ReportRefundRow[];
}

export interface RateTotals {
  rateBasisPoints: number;
  grossCents: number;
  taxCents: number;
  netCents: number;
}

export interface ReportTotals {
  orderCount: number;
  grossCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  refundCents: number;
  takingsCents: number;
  byRate: RateTotals[];
}

export interface ReportDay extends ReportTotals {
  date: string;
}

export interface ReportModeTotals {
  mode: FulfilmentMode;
  orderCount: number;
  grossCents: number;
}

export interface ReportDish {
  productId: string;
  name: string;
  quantity: number;
  grossCents: number;
}

export interface SalesReport {
  shopId: string;
  from: string;
  to: string;
  timezone: string;
  currency: string;
  totals: ReportTotals;
  days: ReportDay[];
  byHour: number[];
  byMode: ReportModeTotals[];
  topDishes: ReportDish[];
}

/** 'YYYY-MM-DD' plus n calendar days. */
export function addDays(date: string, n: number): string {
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)) + n))
    .toISOString()
    .slice(0, 10);
}

/** Every date from..to inclusive. Callers pass a range already checked by parseReportRange. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (s: unknown): s is string => typeof s === 'string' && DATE.test(s) && addDays(s, 0) === s;

/** A checked range, or 'invalid'. */
export function parseReportRange(from: unknown, to: unknown): { from: string; to: string } | 'invalid' {
  if (!isRealDate(from) || !isRealDate(to) || from > to) return 'invalid';
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  return span <= REPORT_MAX_DAYS ? { from, to } : 'invalid';
}

/** UTC instants that contain every local moment of from..to in any time zone (UTC-12 to UTC+14). */
export function utcWindowFor(from: string, to: string): { fromIso: string; toIso: string } {
  return { fromIso: `${addDays(from, -1)}T00:00:00.000Z`, toIso: `${addDays(to, 2)}T00:00:00.000Z` };
}

/** The local hour 0-23 of an instant. */
export function localHour(at: Date, timeZone: string): number {
  const h =
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false })
      .formatToParts(at)
      .find((p) => p.type === 'hour')?.value ?? '0';
  return Number(h) % 24; // some engines report midnight as '24' (as openingHours.ts)
}

/**
 * VAT per rate of refund number k, worked out exactly as its correction invoice is (invoice.ts buildCorrection).
 * Positive amounts, rate ascending.
 */
export function refundTaxParts(
  o: Pick<ReportOrderRow, 'items' | 'taxBreakdown' | 'subtotalCents' | 'totalCents' | 'refunds'>,
  k: number,
): TaxBreakdownEntry[] {
  const refunds = o.refunds ?? [];
  const r = refunds[k];
  const base = o.taxBreakdown ?? buildTaxBreakdown(o.items);
  if (k === 0 && r.amountCents === chargedCents(o)) {
    return base.map((e) => ({ rateBasisPoints: e.rateBasisPoints, grossCents: e.grossCents, taxCents: e.taxCents }));
  }
  const byRate = new Map<number, TaxBreakdownEntry>();
  const add = (rate: number, gross: number, tax: number) => {
    const e = byRate.get(rate) ?? { rateBasisPoints: rate, grossCents: 0, taxCents: 0 };
    e.grossCents += gross;
    e.taxCents += tax;
    byRate.set(rate, e);
  };
  if (r.lines) {
    for (const l of r.lines) {
      const listCents = o.items[l.lineIndex].unitPriceCents * l.quantity;
      const share = listCents - l.grossCents;
      const rate = l.taxRateBasisPoints;
      add(
        rate,
        l.grossCents,
        share <= 0
          ? extractVatCents(l.grossCents, rate)
          : extractVatCents(listCents, rate) - extractVatCents(share, rate),
      );
    }
  } else {
    const shapes = refunds.map((x) => ({ amountCents: x.amountCents, lines: x.lines }));
    for (const p of refundPartsByRate(baseByRate(base), shapes, k)) {
      add(p.rateBasisPoints, p.grossCents, extractVatCents(p.grossCents, p.rateBasisPoints));
    }
  }
  return [...byRate.values()].sort((a, b) => a.rateBasisPoints - b.rateBasisPoints);
}

interface Acc {
  orderCount: number;
  grossCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  refundCents: number;
  rates: Map<number, { grossCents: number; taxCents: number }>;
}

const emptyAcc = (): Acc => ({
  orderCount: 0,
  grossCents: 0,
  discountCents: 0,
  deliveryFeeCents: 0,
  refundCents: 0,
  rates: new Map(),
});

function addRate(a: Acc, rate: number, gross: number, tax: number): void {
  const e = a.rates.get(rate) ?? { grossCents: 0, taxCents: 0 };
  e.grossCents += gross;
  e.taxCents += tax;
  a.rates.set(rate, e);
}

function finish(a: Acc): ReportTotals {
  return {
    orderCount: a.orderCount,
    grossCents: a.grossCents,
    discountCents: a.discountCents,
    deliveryFeeCents: a.deliveryFeeCents,
    refundCents: a.refundCents,
    takingsCents: a.grossCents - a.refundCents,
    byRate: [...a.rates]
      .filter(([, e]) => e.grossCents !== 0 || e.taxCents !== 0)
      .sort((x, y) => x[0] - y[0])
      .map(([rateBasisPoints, e]) => ({
        rateBasisPoints,
        grossCents: e.grossCents,
        taxCents: e.taxCents,
        netCents: e.grossCents - e.taxCents,
      })),
  };
}

/** The report for from..to. `rows` may contain the same order twice (both queries); each id counts once. */
export function buildSalesReport(input: {
  shopId: string;
  from: string;
  to: string;
  timezone: string;
  currency: string;
  rows: ReportOrderRow[];
}): SalesReport {
  const { shopId, from, to, timezone, currency, rows } = input;
  const dates = datesBetween(from, to);
  const dayAcc = new Map(dates.map((d) => [d, emptyAcc()]));
  const total = emptyAcc();
  const byHour = new Array<number>(24).fill(0);
  const modes = new Map(FULFILMENT_MODES.map((m) => [m, { orderCount: 0, grossCents: 0 }]));
  const dishes = new Map<string, ReportDish & { nameAt: string }>();
  const seen = new Set<string>();

  for (const o of rows) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    if (!isCaptured(o)) continue;

    const acceptedAt = o.acceptedAt;
    const saleDay = acceptedAt ? dayAcc.get(localDate(acceptedAt, timezone)) : undefined;
    if (saleDay && acceptedAt) {
      const gross = chargedCents(o);
      const fee = (o.charges ?? []).filter((c) => c.kind === 'delivery_fee').reduce((s, c) => s + c.grossCents, 0);
      const rates = o.taxBreakdown ?? buildTaxBreakdown(o.items);
      for (const a of [saleDay, total]) {
        a.orderCount += 1;
        a.grossCents += gross;
        a.discountCents += o.discountCents ?? 0;
        a.deliveryFeeCents += fee;
        for (const e of rates) addRate(a, e.rateBasisPoints, e.grossCents, e.taxCents);
      }
      byHour[localHour(new Date(o.scheduledFor ?? o.createdAt), timezone)] += 1;
      const m = modes.get(o.fulfilmentMode);
      if (m) {
        m.orderCount += 1;
        m.grossCents += gross;
      }
      for (const i of o.items) {
        const d = dishes.get(i.productId) ?? {
          productId: i.productId,
          name: i.productName,
          quantity: 0,
          grossCents: 0,
          nameAt: '',
        };
        d.quantity += i.quantity;
        d.grossCents += i.lineTotalCents - (i.discountCents ?? 0);
        if (acceptedAt >= d.nameAt) {
          d.name = i.productName;
          d.nameAt = acceptedAt;
        }
        dishes.set(i.productId, d);
      }
    }

    (o.refunds ?? []).forEach((r, k) => {
      const day = dayAcc.get(localDate(r.at, timezone));
      if (!day) return;
      const parts = refundTaxParts(o, k);
      for (const a of [day, total]) {
        a.refundCents += r.amountCents;
        for (const p of parts) addRate(a, p.rateBasisPoints, -p.grossCents, -p.taxCents);
      }
    });
  }

  const topDishes = [...dishes.values()]
    .sort((a, b) => b.quantity - a.quantity || b.grossCents - a.grossCents || a.name.localeCompare(b.name))
    .slice(0, TOP_DISHES_COUNT)
    .map(({ productId, name, quantity, grossCents }) => ({ productId, name, quantity, grossCents }));

  return {
    shopId,
    from,
    to,
    timezone,
    currency,
    totals: finish(total),
    days: dates.map((date) => ({ date, ...finish(dayAcc.get(date)!) })),
    byHour,
    byMode: FULFILMENT_MODES.map((mode) => ({ mode, ...modes.get(mode)! })),
    topDishes,
  };
}
