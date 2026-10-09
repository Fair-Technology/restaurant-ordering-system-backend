import { describe, it, expect } from 'vitest';
import { buildCorrection, buildInvoice } from '../../src/domain/invoice/invoice';
import type { Order, RefundLine } from '../../src/domain/order/Order';
import { refundTaxParts } from '../../src/domain/report/salesReport';
import { ACCEPTED_DELIVERY_ORDER, ACCEPTED_TWO_LINE_ORDER, CARD_SHOP, DISCOUNTED_ORDER } from '../fixtures/orders';

// The report's VAT for a refund must equal, to the cent, the negated breakdown of the correction invoice for that refund.
type Shape = { amountCents: number; lines?: RefundLine[] };

function check(order: Order, refunds: Shape[]): void {
  const original = buildInvoice({ order, shop: CARD_SHOP, number: 'R-2026-00001', now: new Date('2026-10-05T10:05:00Z') });
  const row = { ...order, refunds: refunds.map((r) => ({ ...r, at: '2026-10-06T10:00:00.000Z' })) };
  refunds.forEach((_, k) => {
    const corr = buildCorrection({ original, refunds, index: k, refundId: `r${k}`, number: `C-${k}`, now: new Date('2026-10-06T10:00:00Z') });
    const expected = corr.taxBreakdown
      .map((e) => ({ rateBasisPoints: e.rateBasisPoints, grossCents: -e.grossCents, taxCents: -e.taxCents }))
      .sort((a, b) => a.rateBasisPoints - b.rateBasisPoints);
    expect(refundTaxParts(row, k)).toEqual(expected);
  });
}

describe('report refund VAT equals the correction invoice', () => {
  const orders: Order[] = [ACCEPTED_TWO_LINE_ORDER, DISCOUNTED_ORDER, ACCEPTED_DELIVERY_ORDER];

  it.each(orders.map((o, i) => [i, o] as const))('whole-order refund, order %i', (_i, o) => {
    check(o, [{ amountCents: o.totalCents ?? o.subtotalCents }]);
  });

  it.each(orders.map((o, i) => [i, o] as const))('two free partial refunds, order %i', (_i, o) => {
    check(o, [{ amountCents: 137 }, { amountCents: 201 }]);
  });

  it('item refunds, with and without a discount share', () => {
    for (const o of [ACCEPTED_TWO_LINE_ORDER, DISCOUNTED_ORDER]) {
      const lines: RefundLine[] = o.items.map((it, lineIndex) => ({
        lineIndex,
        quantity: it.quantity,
        grossCents: it.lineTotalCents - (it.discountCents ?? 0),
        taxRateBasisPoints: it.taxRateBasisPoints ?? 0,
      }));
      check(o, [{ amountCents: lines[0].grossCents, lines: [lines[0]] }]);
      check(o, [{ amountCents: lines[1].grossCents, lines: [lines[1]] }, { amountCents: 99 }]);
    }
  });
});
