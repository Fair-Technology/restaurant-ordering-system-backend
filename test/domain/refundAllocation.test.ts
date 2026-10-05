import { describe, expect, it } from 'vitest';
import {
  allocateByRate,
  buildItemRefundLines,
  refundPartsByRate,
  refundedQuantities,
  remainingByRate,
} from '../../src/domain/order/refundAllocation';
import { REFUND_ITEMS_ERROR } from '../../src/domain/order/orderErrors';

const B = [
  { rateBasisPoints: 700, grossCents: 1050 },
  { rateBasisPoints: 1900, grossCents: 700 },
];
const cola1 = {
  amountCents: 350,
  lines: [{ lineIndex: 1, quantity: 1, grossCents: 350, taxRateBasisPoints: 1900 }],
};

describe('refund allocation', () => {
  it('ticked items are refunded at their own rate', () => {
    expect(refundPartsByRate(B, [cola1], 0)).toEqual([{ rateBasisPoints: 1900, grossCents: 350 }]);
    expect(remainingByRate(B, [cola1])).toEqual([
      { rateBasisPoints: 700, grossCents: 1050 },
      { rateBasisPoints: 1900, grossCents: 350 },
    ]);
  });

  it('a free amount splits over what is still unrefunded', () => {
    expect(refundPartsByRate(B, [cola1, { amountCents: 280 }], 1)).toEqual([
      { rateBasisPoints: 700, grossCents: 210 },
      { rateBasisPoints: 1900, grossCents: 70 },
    ]);
  });

  it('amount refunds reduce what is left at each rate', () => {
    expect(remainingByRate(B, [{ amountCents: 350 }])).toEqual([
      { rateBasisPoints: 700, grossCents: 840 },
      { rateBasisPoints: 1900, grossCents: 560 },
    ]);
  });

  it('allocation adds up to the cent', () => {
    expect(
      allocateByRate(
        [
          { rateBasisPoints: 700, grossCents: 1000 },
          { rateBasisPoints: 1900, grossCents: 1000 },
        ],
        1,
      ),
    ).toEqual([{ rateBasisPoints: 700, grossCents: 1 }]);
    expect(
      allocateByRate(
        [
          { rateBasisPoints: 700, grossCents: 1050 },
          { rateBasisPoints: 1900, grossCents: 350 },
        ],
        1400,
      ),
    ).toEqual([
      { rateBasisPoints: 700, grossCents: 1050 },
      { rateBasisPoints: 1900, grossCents: 350 },
    ]);
    expect(
      allocateByRate(
        [
          { rateBasisPoints: 700, grossCents: 1000 },
          { rateBasisPoints: 1900, grossCents: 1000 },
          { rateBasisPoints: 0, grossCents: 1000 },
        ],
        100,
      ),
    ).toEqual([
      { rateBasisPoints: 0, grossCents: 33 },
      { rateBasisPoints: 700, grossCents: 34 },
      { rateBasisPoints: 1900, grossCents: 33 },
    ]);
  });

  it('checks ticked quantities against what is left', () => {
    const items = [
      { quantity: 1, unitPriceCents: 1050, taxRateBasisPoints: 700 },
      { quantity: 2, unitPriceCents: 350, taxRateBasisPoints: 1900 },
    ];
    expect(buildItemRefundLines(items, [cola1], [{ lineIndex: 1, quantity: 1 }])).toEqual([
      { lineIndex: 1, quantity: 1, grossCents: 350, taxRateBasisPoints: 1900 },
    ]);
    expect(buildItemRefundLines(items, [cola1], [{ lineIndex: 1, quantity: 2 }])).toBe(
      'Only 1 of line 2 can still be refunded',
    );
    for (const bad of [
      [{ lineIndex: 5, quantity: 1 }],
      [],
      [
        { lineIndex: 0, quantity: 1 },
        { lineIndex: 0, quantity: 1 },
      ],
      [{ lineIndex: 0, quantity: 1.5 }],
    ]) {
      expect(buildItemRefundLines(items, [cola1], bad)).toBe(REFUND_ITEMS_ERROR);
    }
    expect(refundedQuantities(2, [cola1])).toEqual([0, 1]);
  });
});
