import { describe, it, expect } from 'vitest';
import {
  buildSalesReport,
  datesBetween,
  localHour,
  parseReportRange,
  refundTaxParts,
  utcWindowFor,
  type ReportOrderRow,
} from '../../src/domain/report/salesReport';

const TZ = 'Europe/Berlin';
const paid = { method: 'card', status: 'paid', stripePaymentIntentId: 'pi' } as const;
const carbonara = { productId: 'p1', productName: 'Carbonara', quantity: 1, unitPriceCents: 1050, lineTotalCents: 1050, taxRateBasisPoints: 700, taxCents: 69 };
const cola = { productId: 'p2', productName: 'Cola', quantity: 1, unitPriceCents: 350, lineTotalCents: 350, taxRateBasisPoints: 1900, taxCents: 56 };

// O1 collection, accepted Mon 5 Oct 12:00, placed 11:58
const O1: ReportOrderRow = {
  id: 'o1', createdAt: '2026-10-05T09:58:00.000Z', acceptedAt: '2026-10-05T10:00:00.000Z',
  fulfilmentMode: 'collection', payment: paid, subtotalCents: 1050, totalCents: 1050, items: [carbonara],
  taxBreakdown: [{ rateBasisPoints: 700, grossCents: 1050, taxCents: 69 }], refunds: [],
};
// O2 delivery with a 2,50 fee and WELCOME10 (-1,40), accepted 19:30; the cola refunded Tue 6 Oct 10:00
const O2: ReportOrderRow = {
  id: 'o2', createdAt: '2026-10-05T17:29:00.000Z', acceptedAt: '2026-10-05T17:30:00.000Z',
  fulfilmentMode: 'delivery', payment: { ...paid, status: 'partially_refunded' }, subtotalCents: 1400, totalCents: 1510,
  charges: [{ kind: 'delivery_fee', grossCents: 250 }], discountCents: 140,
  items: [{ ...carbonara, discountCents: 105 }, { ...cola, discountCents: 35 }],
  taxBreakdown: [{ rateBasisPoints: 700, grossCents: 1195, taxCents: 78 }, { rateBasisPoints: 1900, grossCents: 315, taxCents: 50 }],
  refunds: [{ amountCents: 315, at: '2026-10-06T08:00:00.000Z', lines: [{ lineIndex: 1, quantity: 1, grossCents: 315, taxRateBasisPoints: 1900 }] }],
};
// O3 booked on Sun 4 Oct 17:00 for Tue 6 Oct 18:00, accepted 17:40
const O3: ReportOrderRow = {
  id: 'o3', createdAt: '2026-10-04T15:00:00.000Z', acceptedAt: '2026-10-06T15:40:00.000Z',
  scheduledFor: '2026-10-06T16:00:00.000Z', fulfilmentMode: 'collection', payment: paid, subtotalCents: 700, totalCents: 700,
  items: [{ ...cola, quantity: 2, lineTotalCents: 700, taxCents: 112 }],
  taxBreakdown: [{ rateBasisPoints: 1900, grossCents: 700, taxCents: 112 }], refunds: [],
};
// O4 table order accepted Fri 2 Oct, fully refunded (free amount) Mon 5 Oct 14:00
const O4: ReportOrderRow = {
  id: 'o4', createdAt: '2026-10-02T10:58:00.000Z', acceptedAt: '2026-10-02T11:00:00.000Z',
  fulfilmentMode: 'dine_in', payment: { ...paid, status: 'refunded' }, subtotalCents: 1050, totalCents: 1050, items: [carbonara],
  taxBreakdown: [{ rateBasisPoints: 700, grossCents: 1050, taxCents: 69 }],
  refunds: [{ amountCents: 1050, at: '2026-10-05T12:00:00.000Z' }],
};
// O5 an old pay-in-person order: never counts
const O5 = { ...O1, id: 'o5', payment: { method: 'cash', status: 'paid', stripePaymentIntentId: null } } as unknown as ReportOrderRow;
// O6 accepted Wed 7 Oct 00:30 Berlin (still 6 Oct in UTC): outside a range ending 6 Oct
const O6: ReportOrderRow = { ...O1, id: 'o6', createdAt: '2026-10-06T22:29:00.000Z', acceptedAt: '2026-10-06T22:30:00.000Z' };
// O7 accepted Mon 5 Oct 00:30 Berlin (still 4 Oct in UTC): inside
const O7: ReportOrderRow = {
  id: 'o7', createdAt: '2026-10-04T22:29:00.000Z', acceptedAt: '2026-10-04T22:30:00.000Z',
  fulfilmentMode: 'collection', payment: paid, subtotalCents: 350, totalCents: 350, items: [cola],
  taxBreakdown: [{ rateBasisPoints: 1900, grossCents: 350, taxCents: 56 }], refunds: [],
};
// O2 twice, as both queries return it
const report = () =>
  buildSalesReport({
    shopId: 'shop-1', from: '2026-10-05', to: '2026-10-06', timezone: TZ, currency: 'EUR',
    rows: [O1, O2, O3, O4, O5, O6, O7, O2],
  });

describe('salesReport', () => {
  it("an order counts on the restaurant's local day of acceptance", () => {
    expect(report().days.map((d) => [d.date, d.orderCount])).toEqual([['2026-10-05', 3], ['2026-10-06', 1]]);
  });

  it('a refund lowers the day it was made, not the day of the order', () => {
    const { days } = report();
    expect(days[0]).toMatchObject({ grossCents: 2910, refundCents: 1050, takingsCents: 1860, discountCents: 140, deliveryFeeCents: 250 });
    expect(days[1]).toMatchObject({ grossCents: 700, refundCents: 315, takingsCents: 385, discountCents: 0, deliveryFeeCents: 0 });
  });

  it('VAT per rate is what was paid minus refunds', () => {
    const r = report();
    expect(r.days[0].byRate).toEqual([
      { rateBasisPoints: 700, grossCents: 1195, taxCents: 78, netCents: 1117 },
      { rateBasisPoints: 1900, grossCents: 665, taxCents: 106, netCents: 559 },
    ]);
    expect(r.days[1].byRate).toEqual([{ rateBasisPoints: 1900, grossCents: 385, taxCents: 62, netCents: 323 }]);
    expect(r.totals).toMatchObject({ orderCount: 4, grossCents: 3610, discountCents: 140, deliveryFeeCents: 250, refundCents: 1365, takingsCents: 2245 });
    expect(r.totals.byRate).toEqual([
      { rateBasisPoints: 700, grossCents: 1195, taxCents: 78, netCents: 1117 },
      { rateBasisPoints: 1900, grossCents: 1050, taxCents: 168, netCents: 882 },
    ]);
  });

  it('an order for later counts at its booked hour', () => {
    const expected = new Array<number>(24).fill(0);
    expected[0] = 1;
    expected[11] = 1;
    expected[18] = 1;
    expected[19] = 1;
    expect(report().byHour).toEqual(expected);
  });

  it('the mode split always lists collection, delivery and table', () => {
    expect(report().byMode).toEqual([
      { mode: 'collection', orderCount: 3, grossCents: 2100 },
      { mode: 'delivery', orderCount: 1, grossCents: 1510 },
      { mode: 'dine_in', orderCount: 0, grossCents: 0 },
    ]);
  });

  it('top dishes rank by units sold, not by amount', () => {
    expect(report().topDishes).toEqual([
      { productId: 'p2', name: 'Cola', quantity: 4, grossCents: 1365 },
      { productId: 'p1', name: 'Carbonara', quantity: 2, grossCents: 1995 },
    ]);
  });

  it("an item refund's VAT matches its correction invoice, not a re-extraction", () => {
    expect(
      refundTaxParts(
        {
          subtotalCents: 1150, totalCents: 1147,
          items: [
            { productId: 'b', productName: 'Bread', quantity: 1, unitPriceCents: 100, lineTotalCents: 100, taxRateBasisPoints: 700, taxCents: 7, discountCents: 3 },
            carbonara,
          ],
          refunds: [{ amountCents: 97, at: '2026-10-05T10:00:00.000Z', lines: [{ lineIndex: 0, quantity: 1, grossCents: 97, taxRateBasisPoints: 700 }] }],
        },
        0,
      ),
    ).toEqual([{ rateBasisPoints: 700, grossCents: 97, taxCents: 7 }]);
  });

  it('a first refund of the whole order mirrors the cancellation invoice', () => {
    expect(refundTaxParts(O4, 0)).toEqual([{ rateBasisPoints: 700, grossCents: 1050, taxCents: 69 }]);
  });

  it('a free partial refund is split by what is left at each rate', () => {
    expect(
      refundTaxParts(
        {
          subtotalCents: 1400, totalCents: 1400, items: [carbonara, cola],
          taxBreakdown: [{ rateBasisPoints: 700, grossCents: 1050, taxCents: 69 }, { rateBasisPoints: 1900, grossCents: 350, taxCents: 56 }],
          refunds: [{ amountCents: 140, at: '2026-10-05T10:00:00.000Z' }],
        },
        0,
      ),
    ).toEqual([
      { rateBasisPoints: 700, grossCents: 105, taxCents: 7 },
      { rateBasisPoints: 1900, grossCents: 35, taxCents: 6 },
    ]);
  });

  it('ranges are real dates, in order, at most 92 days', () => {
    expect(parseReportRange('2026-10-05', '2026-10-06')).toEqual({ from: '2026-10-05', to: '2026-10-06' });
    expect(parseReportRange('2026-10-06', '2026-10-05')).toBe('invalid');
    expect(parseReportRange('2026-02-30', '2026-03-01')).toBe('invalid');
    expect(parseReportRange('2026-01-01', '2026-04-02')).toEqual({ from: '2026-01-01', to: '2026-04-02' });
    expect(parseReportRange('2026-01-01', '2026-04-03')).toBe('invalid');
    expect(parseReportRange(undefined, '2026-10-05')).toBe('invalid');
    expect(parseReportRange('5.10.2026', '2026-10-05')).toBe('invalid');
  });

  it('the query window covers the local days with a day to spare', () => {
    expect(utcWindowFor('2026-10-05', '2026-10-06')).toEqual({
      fromIso: '2026-10-04T00:00:00.000Z',
      toIso: '2026-10-08T00:00:00.000Z',
    });
    expect(datesBetween('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('the repeated hour on the clock-change night is hour 2 both times', () => {
    expect(localHour(new Date('2026-10-25T00:30:00Z'), TZ)).toBe(2);
    expect(localHour(new Date('2026-10-25T01:30:00Z'), TZ)).toBe(2);
  });
});
