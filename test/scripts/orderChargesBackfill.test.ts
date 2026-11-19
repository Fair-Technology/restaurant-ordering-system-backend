import { describe, expect, it } from 'vitest';
import type { Order, OrderCharge } from '../../src/domain/order/Order';
import { planChargesBackfill } from '../../scripts/orderChargesBackfill';

const fee: OrderCharge = { kind: 'delivery_fee', grossCents: 250, taxClassId: 'food', taxRateBasisPoints: 700, taxCents: 16 };
const bd = [{ rateBasisPoints: 700, grossCents: 1550, taxCents: 101 }];
const order = (o: Partial<Order> = {}): Order =>
  ({ id: 'o1', fulfilmentMode: 'delivery', subtotalCents: 1300, taxBreakdown: bd, ...o }) as unknown as Order;

describe('planChargesBackfill', () => {
  it('writes the fee and total when everything lines up with what Stripe charged (895-3W5)', () => {
    expect(planChargesBackfill(order(), fee, 1550)).toEqual({ kind: 'backfill', charges: [fee], totalCents: 1550 });
  });
  it('refuses when subtotal + fee is not the charged amount', () => {
    expect(planChargesBackfill(order(), fee, 1300).kind).toBe('refuse');
  });
  it('refuses when the stored taxBreakdown disagrees with the charged amount', () => {
    expect(planChargesBackfill(order({ taxBreakdown: [{ rateBasisPoints: 700, grossCents: 1300, taxCents: 85 }] }), fee, 1550).kind).toBe('refuse');
  });
  it('refuses a non-delivery order', () => {
    expect(planChargesBackfill(order({ fulfilmentMode: 'collection' }), fee, 1550).kind).toBe('refuse');
  });
  it('is idempotent: an already backfilled order is a noop', () => {
    expect(planChargesBackfill(order({ charges: [fee], totalCents: 1550 }), fee, 1550)).toEqual({ kind: 'noop' });
  });
  it('refuses to overwrite different existing charges', () => {
    expect(planChargesBackfill(order({ charges: [{ ...fee, grossCents: 300 }], totalCents: 1600 }), fee, 1550).kind).toBe('refuse');
  });
});
