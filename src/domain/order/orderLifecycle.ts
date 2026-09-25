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
};

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
