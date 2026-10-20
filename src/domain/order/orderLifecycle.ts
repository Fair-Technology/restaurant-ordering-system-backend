import { Order, OrderActor, OrderState, StoredOrderState } from './Order';

export interface TransitionContext {
  now: Date;
  actor: OrderActor;
  reason?: string;
  readyAt?: Date;
  prepMinutes?: number;
}

export type TransitionResult = { ok: true; order: Order } | { ok: false; error: string };

const EDGES: Record<StoredOrderState, StoredOrderState[]> = {
  PLACED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['READY', 'OUT_FOR_DELIVERY', 'CANCELLED'],
  READY: ['COMPLETED'],
  OUT_FOR_DELIVERY: ['COMPLETED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  REFUNDED: [],
};

/** States in which a full refund ends the order (it is not handed over yet). */
export const REFUND_ENDS_STATES: readonly StoredOrderState[] = ['ACCEPTED', 'READY', 'OUT_FOR_DELIVERY'];

/** Moves an in-play order to REFUNDED when its payment is fully refunded; otherwise returns `order` itself. */
export function endIfFullyRefunded(order: Order, nowIso: string, actor: OrderActor): Order {
  if (order.payment.status !== 'refunded' || !REFUND_ENDS_STATES.includes(order.state)) return order;
  return {
    ...order,
    state: 'REFUNDED',
    updatedAt: nowIso,
    history: [...order.history, { from: order.state, to: 'REFUNDED', at: nowIso, actor }],
  };
}

/** Puts a REFUNDED order that is no longer fully refunded back in the state it ended from; otherwise returns `order` itself. */
export function reopenIfNoLongerRefunded(order: Order, nowIso: string, actor: OrderActor): Order {
  if (order.state !== 'REFUNDED' || order.payment.status === 'refunded') return order;
  const ending = [...order.history].reverse().find((h) => h.to === 'REFUNDED');
  const back = ending?.from;
  if (!back || !REFUND_ENDS_STATES.includes(back)) return order;
  return {
    ...order,
    state: back,
    updatedAt: nowIso,
    history: [...order.history, { from: 'REFUNDED', to: back, at: nowIso, actor }],
  };
}

export function deriveDisplayState(
  order: Pick<Order, 'state' | 'readyAt' | 'prepMinutes'>,
  now: Date,
): OrderState {
  if (order.state !== 'ACCEPTED') return order.state;
  if (order.readyAt === undefined || order.prepMinutes === undefined) return 'ACCEPTED';
  const prepStartMs = Date.parse(order.readyAt) - order.prepMinutes * 60_000;
  return now.getTime() >= prepStartMs ? 'IN_PREPARATION' : 'ACCEPTED';
}

export function applyTransition(order: Order, to: OrderState, ctx: TransitionContext): TransitionResult {
  const fail = (error: string): TransitionResult => ({ ok: false, error });
  if (to === 'IN_PREPARATION') return fail('IN_PREPARATION is derived and cannot be set');
  const target: StoredOrderState = to as StoredOrderState; // narrowed by the check above
  if (!EDGES[order.state].includes(target)) return fail(`Cannot move from ${order.state} to ${target}`);
  const at = ctx.now.toISOString();
  const next: Order = { ...order, state: target, updatedAt: at, history: [...order.history] };
  let reason: string | undefined;
  switch (target) {
    case 'ACCEPTED':
      if (!ctx.readyAt || ctx.prepMinutes === undefined) return fail('readyAt and prepMinutes are required to accept');
      next.acceptedAt = at;
      next.readyAt = ctx.readyAt.toISOString();
      next.prepMinutes = ctx.prepMinutes;
      break;
    case 'REJECTED':
    case 'CANCELLED':
      reason = ctx.reason?.trim();
      if (!reason) return fail('A reason is required');
      if (target === 'CANCELLED' && order.state === 'ACCEPTED' && deriveDisplayState(order, ctx.now) !== 'ACCEPTED')
        return fail('Cannot cancel once preparation has started');
      break;
    case 'READY':
      if (order.fulfilmentMode === 'delivery') return fail('READY is only for collection and dine-in orders');
      break;
    case 'OUT_FOR_DELIVERY':
      if (order.fulfilmentMode !== 'delivery') return fail('OUT_FOR_DELIVERY is only for delivery orders');
      break;
  }
  next.history.push({ from: order.state, to: target, at, actor: ctx.actor, ...(reason ? { reason } : {}) });
  return { ok: true, order: next };
}
