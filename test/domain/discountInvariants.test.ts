import { describe, expect, it } from 'vitest';
import { allocateByWeight, applyDiscount, capDiscount, paidCentsForUnits } from '../../src/domain/order/discount';
import { extractVatCents } from '../../src/domain/order/tax';
import type { OrderItem } from '../../src/domain/order/Order';
import { FEE_CHARGE } from '../fixtures/orders';

const item = (cents: number, rate: number, quantity = 1): OrderItem => ({
  productId: `p${cents}${rate}`,
  productName: `P${cents}`,
  quantity,
  unitPriceCents: cents / quantity,
  lineTotalCents: cents,
  taxClassId: 'x',
  taxRateBasisPoints: rate,
  taxCents: extractVatCents(cents, rate),
});

describe('discount invariants', () => {
  it('shares always add up to the discount and never exceed their line', () => {
    const baskets = [[1050, 350], [333, 333, 334], [1, 1, 1], [999, 1, 500], [10000, 3], [7, 11, 13, 17]];
    for (const weights of baskets) {
      const total = weights.reduce((s, w) => s + w, 0);
      for (let amount = 1; amount <= total; amount += Math.max(1, Math.floor(total / 97))) {
        const shares = allocateByWeight(weights, amount);
        expect(shares.reduce((s, x) => s + x, 0)).toBe(amount);
        shares.forEach((s, i) => expect(s).toBeLessThanOrEqual(weights[i]));
      }
    }
  });

  it('per-rate gross and VAT of the paid breakdown equal list breakdown minus the discount, with and without the fee', () => {
    const items = [item(1050, 700), item(350, 1900), item(333, 700, 3)];
    for (const charges of [[], [FEE_CHARGE]]) {
      for (const cents of [1, 99, 333, 1000, 1733 - 50]) {
        const r = applyDiscount(items, charges, { kind: 'code', code: 'X', cents });
        const paidGross = r.taxBreakdown.reduce((s, t) => s + t.grossCents, 0);
        expect(paidGross).toBe(r.totalCents);
        expect(r.discount.byRate.reduce((s, t) => s + t.grossCents, 0)).toBe(cents);
        expect(r.items.reduce((s, i) => s + (i.discountCents ?? 0), 0)).toBe(cents);
        // the fee line is untouched: the 7 % entry still contains it
        if (charges.length) expect(r.totalCents).toBe(1733 + FEE_CHARGE.grossCents - cents);
      }
    }
  });

  it('the cap keeps the fee whole and the card at 0,50 EUR or more', () => {
    for (const [sub, fee] of [[1400, 0], [1400, 250], [60, 0], [60, 250], [50, 0], [49, 0], [1, 250]]) {
      const c = capDiscount(100000, sub, fee);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(sub);
      if (c > 0) expect(sub + fee - c).toBeGreaterThanOrEqual(50);
    }
    expect(capDiscount(100000, 1400, 250)).toBe(1400); // fee never discounted
    expect(capDiscount(100000, 1400, 0)).toBe(1350);
  });

  it('refunding every unit one by one pays back exactly what was paid', () => {
    const line = { quantity: 3, unitPriceCents: 333, lineTotalCents: 999, discountCents: 100 };
    let sum = 0;
    for (let k = 0; k < 3; k++) sum += paidCentsForUnits(line, k, 1);
    expect(sum).toBe(899);
    expect(paidCentsForUnits(line, 0, 3)).toBe(899);
  });
});
