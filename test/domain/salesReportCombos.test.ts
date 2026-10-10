import { describe, it, expect } from 'vitest';
import { buildSalesReport, type ReportItemRow, type ReportOrderRow } from '../../src/domain/report/salesReport';

const paid = { method: 'card', status: 'paid', stripePaymentIntentId: 'pi' } as const;
const pomodoro: ReportItemRow = { productId: 'pom', productName: 'Pomodoro', quantity: 1, unitPriceCents: 900, lineTotalCents: 900, taxRateBasisPoints: 700, taxCents: 59 };
const part = (productId: string, name: string, combo: ReportItemRow['combo'], cents: number, quantity = 1): ReportItemRow => ({
  productId, productName: `${combo?.name}: ${name}`, quantity, unitPriceCents: cents, lineTotalCents: cents * quantity,
  taxRateBasisPoints: 700, taxCents: 0, combo,
});
const menu = { line: 0, productId: 'menu', name: 'Pasta-Menü' };
const bmf = { line: 0, productId: 'menu-bmf', name: 'Pasta-Menü BMF' };
const order = (id: string, items: ReportItemRow[], extra: Partial<ReportOrderRow> = {}): ReportOrderRow => ({
  id, createdAt: '2026-10-05T09:58:00.000Z', acceptedAt: '2026-10-05T10:00:00.000Z', fulfilmentMode: 'collection',
  payment: paid, subtotalCents: 0, totalCents: 0, items, refunds: [], ...extra,
});
const dishes = (rows: ReportOrderRow[]) =>
  buildSalesReport({ shopId: 's', from: '2026-10-05', to: '2026-10-05', timezone: 'Europe/Berlin', currency: 'EUR', rows }).topDishes;

describe('top dishes with combos', () => {
  it('a dish alone and the same dish in a combo are separate rows', () => {
    const rows = [
      order('a', [pomodoro]),
      order('b', [part('pom', 'Pomodoro', menu, 600), part('cola', 'Cola', menu, 300)]),
    ];
    expect(dishes(rows)).toEqual([
      { productId: 'menu', name: 'Pasta-Menü', quantity: 1, grossCents: 900 },
      { productId: 'pom', name: 'Pomodoro', quantity: 1, grossCents: 900 },
    ]);
  });

  it('two combo kinds are separate rows', () => {
    const rows = [
      order('a', [part('pom', 'Pomodoro', menu, 600)]),
      order('b', [part('pom', 'Pomodoro', bmf, 500)]),
    ];
    expect(dishes(rows).map((d) => [d.productId, d.name, d.quantity])).toEqual([
      ['menu', 'Pasta-Menü', 1],
      ['menu-bmf', 'Pasta-Menü BMF', 1],
    ]);
  });

  it('a combo of two dishes sold once is Sold 1; the amount is both shares', () => {
    const [d] = dishes([order('a', [part('pom', 'Pomodoro', menu, 600), part('cola', 'Cola', menu, 300)])]);
    expect(d).toEqual({ productId: 'menu', name: 'Pasta-Menü', quantity: 1, grossCents: 900 });
  });

  it('a combo with quantity 2 counts 2, and two combos in one basket count once each', () => {
    const two = [part('pom', 'Pomodoro', menu, 600, 2), part('cola', 'Cola', menu, 300, 2)];
    expect(dishes([order('a', two)])[0]).toMatchObject({ quantity: 2, grossCents: 1800 });
    const separate = [
      part('pom', 'Pomodoro', menu, 600), part('cola', 'Cola', menu, 300),
      part('pom', 'Pomodoro', { ...menu, line: 1 }, 600), part('cola', 'Cola', { ...menu, line: 1 }, 300),
    ];
    expect(dishes([order('b', separate)])[0]).toMatchObject({ quantity: 2, grossCents: 1800 });
  });

  it('a refunded combo is handled like any refunded line: the report does not deduct it from dishes', () => {
    const items = [part('pom', 'Pomodoro', menu, 600), part('cola', 'Cola', menu, 300)];
    const refunded = order('a', items, {
      payment: { ...paid, status: 'refunded' },
      refunds: [{
        amountCents: 900, at: '2026-10-05T12:00:00.000Z',
        lines: [
          { lineIndex: 0, quantity: 1, grossCents: 600, taxRateBasisPoints: 700 },
          { lineIndex: 1, quantity: 1, grossCents: 300, taxRateBasisPoints: 700 },
        ],
      }],
    });
    expect(dishes([refunded])).toEqual(dishes([order('a', items)]));
  });
});
