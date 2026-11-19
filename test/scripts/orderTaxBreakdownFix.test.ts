import { describe, expect, it } from 'vitest';
import type { Order } from '../../src/domain/order/Order';
import { planTaxBreakdownFix, recomputeTaxBreakdown } from '../../scripts/orderTaxBreakdownFix';

const item = { lineTotalCents: 1300, taxRateBasisPoints: 700, taxCents: 85 };
const fee = { kind: 'delivery_fee', grossCents: 250, taxClassId: 'food', taxRateBasisPoints: 700, taxCents: 16 };
const order = (o: Partial<Order>): Order => ({ id: 'o1', items: [item], subtotalCents: 1300, ...o }) as unknown as Order;

describe('planTaxBreakdownFix', () => {
  it('corrects a breakdown that sums to total + the fee when the order records no fee (895-3W5)', () => {
    const plan = planTaxBreakdownFix(order({ taxBreakdown: [{ rateBasisPoints: 700, grossCents: 1550, taxCents: 101 }] }));
    expect(plan).toMatchObject({ kind: 'fix', beforeGrossCents: 1550, totalCents: 1300 });
    expect(plan && plan.kind === 'fix' && plan.after).toEqual([{ rateBasisPoints: 700, grossCents: 1300, taxCents: 85 }]);
  });

  it('leaves a consistent delivery order alone', () => {
    const o = order({ charges: [fee] as never, totalCents: 1550, taxBreakdown: [{ rateBasisPoints: 700, grossCents: 1550, taxCents: 101 }] });
    expect(planTaxBreakdownFix(o)).toBeNull();
  });

  it('leaves orders without a stored breakdown alone', () => {
    expect(planTaxBreakdownFix(order({}))).toBeNull();
  });

  it('is idempotent: the corrected order needs no further fix', () => {
    const o = order({ taxBreakdown: [{ rateBasisPoints: 700, grossCents: 1550, taxCents: 101 }] });
    const plan = planTaxBreakdownFix(o);
    if (!plan || plan.kind !== 'fix') throw new Error('expected a fix');
    expect(planTaxBreakdownFix({ ...o, taxBreakdown: plan.after })).toBeNull();
  });

  it('reports unfixable when items and total disagree even after recomputing', () => {
    const o = order({ totalCents: 9999, taxBreakdown: [{ rateBasisPoints: 700, grossCents: 1550, taxCents: 101 }] });
    expect(planTaxBreakdownFix(o)).toEqual({ kind: 'unfixable', reason: 'recomputed gross 1300 != charged 9999' });
  });

  it('takes the discount share off per rate, like checkout', () => {
    const o = order({
      charges: [fee] as never,
      totalCents: 1450,
      discount: { kind: 'code', code: 'X', cents: 100, byRate: [{ rateBasisPoints: 700, grossCents: 100, taxCents: 7 }] },
      taxBreakdown: [{ rateBasisPoints: 700, grossCents: 1550, taxCents: 101 }],
    });
    const plan = planTaxBreakdownFix(o);
    expect(plan && plan.kind === 'fix' && plan.after).toEqual([{ rateBasisPoints: 700, grossCents: 1450, taxCents: 94 }]);
  });
});

describe('recomputeTaxBreakdown', () => {
  it('groups dishes and charges by rate, ascending', () => {
    const r = recomputeTaxBreakdown({
      items: [item, { lineTotalCents: 500, taxRateBasisPoints: 0, taxCents: 0 }] as never,
      charges: [{ ...fee, taxRateBasisPoints: 1900, taxCents: 40 }] as never,
    });
    expect(r.map((e) => e.rateBasisPoints)).toEqual([0, 700, 1900]);
  });
});
