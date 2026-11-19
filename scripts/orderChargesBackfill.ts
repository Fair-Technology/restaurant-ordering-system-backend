import type { Order, OrderCharge } from '../src/domain/order/Order';

export type ChargesBackfill =
  | { kind: 'backfill'; charges: OrderCharge[]; totalCents: number }
  | { kind: 'noop' }
  | { kind: 'refuse'; reason: string };

/**
 * An order that was charged `chargedCents` (read from Stripe by a human) but stored neither `charges` nor `totalCents`:
 * the fee the diner paid is written back so the order agrees with the payment. Pure; never touches taxBreakdown.
 * Refuses unless every number already lines up, so it cannot "repair" an order into a different wrong state.
 */
export function planChargesBackfill(order: Order, fee: OrderCharge, chargedCents: number): ChargesBackfill {
  if (order.charges !== undefined || order.totalCents !== undefined) {
    return order.totalCents === chargedCents && (order.charges ?? []).some((c) => c.kind === fee.kind && c.grossCents === fee.grossCents)
      ? { kind: 'noop' }
      : { kind: 'refuse', reason: 'order already has charges/totalCents that differ from the requested backfill' };
  }
  if (order.fulfilmentMode !== 'delivery') return { kind: 'refuse', reason: 'not a delivery order' };
  if (order.subtotalCents + fee.grossCents !== chargedCents) {
    return { kind: 'refuse', reason: `subtotal ${order.subtotalCents} + fee ${fee.grossCents} != charged ${chargedCents}` };
  }
  const gross = (order.taxBreakdown ?? []).reduce((s, e) => s + e.grossCents, 0);
  if (gross !== chargedCents) return { kind: 'refuse', reason: `stored taxBreakdown gross ${gross} != charged ${chargedCents}` };
  return { kind: 'backfill', charges: [fee], totalCents: chargedCents };
}
