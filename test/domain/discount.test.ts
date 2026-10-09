import { describe, expect, it } from 'vitest';
import { allocateByWeight, applyDiscount, capDiscount, discountCentsFor, paidCentsForUnits } from '../../src/domain/order/discount';
import { DISCOUNTED_ORDER, FEE_CHARGE } from '../fixtures/orders';

const TWO = DISCOUNTED_ORDER.items.map(({ discountCents: _d, ...i }) => i);

describe('discount maths', () => {
  it('percentages round half up', () => {
    expect(discountCentsFor({ kind: 'percent', percent: 15, amountCents: null }, 1050)).toBe(158);
    expect(discountCentsFor({ kind: 'percent', percent: 10, amountCents: null }, 1400)).toBe(140);
    expect(discountCentsFor({ kind: 'amount', percent: null, amountCents: 500 }, 1400)).toBe(500);
  });

  it('a discount never takes the charge below 50 cents and never touches the fee', () => {
    expect(capDiscount(2000, 1400, 0)).toBe(1350);
    expect(capDiscount(2000, 1750, 250)).toBe(1750);
    expect(capDiscount(100, 30, 0)).toBe(0);
    expect(capDiscount(140, 1400, 0)).toBe(140);
  });

  it('spreads by value, the leftover cent to the largest fraction', () => {
    expect(allocateByWeight([1050, 350], 333)).toEqual([250, 83]);
    expect(allocateByWeight([1050, 350], 140)).toEqual([105, 35]);
    expect(allocateByWeight([0, 700], 70)).toEqual([0, 70]);
    expect(allocateByWeight([500, 500, 500], 100)).toEqual([34, 33, 33]);
    expect(allocateByWeight([1050], 0)).toEqual([0]);
  });

  it("the discount lowers each VAT rate's taxable amount", () => {
    const r = applyDiscount(TWO, [], { kind: 'code', code: 'WELCOME10', cents: 140 });
    expect(r.items.map((i) => i.discountCents)).toEqual([105, 35]);
    expect(r.discount.byRate).toEqual([
      { rateBasisPoints: 700, grossCents: 105, taxCents: 7 },
      { rateBasisPoints: 1900, grossCents: 35, taxCents: 6 },
    ]);
    expect(r.taxBreakdown).toEqual([
      { rateBasisPoints: 700, grossCents: 945, taxCents: 62 },
      { rateBasisPoints: 1900, grossCents: 315, taxCents: 50 },
    ]);
    expect(r.totalCents).toBe(1260);
  });

  it('a fixed amount uses the largest remainder', () => {
    const r = applyDiscount(TWO, [], { kind: 'code', code: 'X', cents: 333 });
    expect(r.items.map((i) => i.discountCents)).toEqual([250, 83]);
    expect(r.discount.byRate).toEqual([
      { rateBasisPoints: 700, grossCents: 250, taxCents: 16 },
      { rateBasisPoints: 1900, grossCents: 83, taxCents: 13 },
    ]);
    expect(r.taxBreakdown).toEqual([
      { rateBasisPoints: 700, grossCents: 800, taxCents: 53 },
      { rateBasisPoints: 1900, grossCents: 267, taxCents: 43 },
    ]);
    expect(r.totalCents).toBe(1067);
  });

  it('the fee keeps its full amount', () => {
    const r = applyDiscount(TWO, [FEE_CHARGE], { kind: 'code', code: 'WELCOME10', cents: 140 });
    expect(r.taxBreakdown).toEqual([
      { rateBasisPoints: 700, grossCents: 1195, taxCents: 78 },
      { rateBasisPoints: 1900, grossCents: 315, taxCents: 50 },
    ]);
    expect(r.totalCents).toBe(1510);
  });

  it('paid units add up to the line', () => {
    const line = { quantity: 2, unitPriceCents: 350, lineTotalCents: 700, discountCents: 133 };
    expect(paidCentsForUnits(line, 0, 1)).toBe(283);
    expect(paidCentsForUnits(line, 1, 1)).toBe(284);
    expect(paidCentsForUnits({ quantity: 2, unitPriceCents: 350 }, 0, 2)).toBe(700);
  });
});
