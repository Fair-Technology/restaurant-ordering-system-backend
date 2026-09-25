import { describe, it, expect } from 'vitest';
import { applyTransition, deriveDisplayState } from '../../src/domain/order/orderLifecycle';
import { Order } from '../../src/domain/order/Order';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'o1',
    shopId: 's1',
    orderRef: 'AB3-K7P',
    state: 'PLACED',
    fulfilmentMode: 'collection',
    payment: { method: 'card', status: 'paid', stripePaymentIntentId: 'pi_1' },
    items: [],
    subtotalCents: 1800,
    currency: 'EUR',
    customerName: 'Anna',
    customerEmail: 'a@example.com',
    customerPhone: '+49 30 1234',
    history: [{ from: null, to: 'PLACED', at: '2026-09-25T11:59:00.000Z', actor: { type: 'system' } }],
    createdAt: '2026-09-25T11:59:00.000Z',
    updatedAt: '2026-09-25T11:59:00.000Z',
    ...overrides,
  };
}

describe('applyTransition', () => {
  it('accepts a placed order', () => {
    const order = makeOrder();
    const res = applyTransition(order, 'ACCEPTED', {
      now: new Date('2026-09-25T12:00:00Z'),
      readyAt: new Date('2026-09-25T12:20:00Z'),
      prepMinutes: 20,
      actor: { type: 'system' },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.order.state).toBe('ACCEPTED');
    expect(res.order.acceptedAt).toBe('2026-09-25T12:00:00.000Z');
    expect(res.order.readyAt).toBe('2026-09-25T12:20:00.000Z');
    expect(res.order.prepMinutes).toBe(20);
    expect(res.order.history).toHaveLength(2);
    expect(res.order.history[1]).toEqual({
      from: 'PLACED',
      to: 'ACCEPTED',
      at: '2026-09-25T12:00:00.000Z',
      actor: { type: 'system' },
    });
  });

  it('refuses accept without readyAt', () => {
    const order = makeOrder();
    const res = applyTransition(order, 'ACCEPTED', { now: new Date('2026-09-25T12:00:00Z'), actor: { type: 'system' } });
    expect(res).toEqual({ ok: false, error: 'readyAt and prepMinutes are required to accept' });
  });

  it('rejects with a reason', () => {
    const order = makeOrder();
    const res = applyTransition(order, 'REJECTED', {
      now: new Date('2026-09-25T12:00:00Z'),
      actor: { type: 'system' },
      reason: 'Out of dough',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.order.state).toBe('REJECTED');
    expect(res.order.history[res.order.history.length - 1].reason).toBe('Out of dough');
  });

  it('refuses a blank reason', () => {
    const order = makeOrder();
    const res = applyTransition(order, 'REJECTED', { now: new Date('2026-09-25T12:00:00Z'), actor: { type: 'system' }, reason: '  ' });
    expect(res).toEqual({ ok: false, error: 'A reason is required' });
  });

  it('refuses READY from PLACED', () => {
    const order = makeOrder();
    const res = applyTransition(order, 'READY', { now: new Date('2026-09-25T12:00:00Z'), actor: { type: 'system' } });
    expect(res).toEqual({ ok: false, error: 'Cannot move from PLACED to READY' });
  });

  it('marks an accepted collection order ready', () => {
    const accepted = applyTransition(makeOrder(), 'ACCEPTED', {
      now: new Date('2026-09-25T12:00:00Z'),
      readyAt: new Date('2026-09-25T12:20:00Z'),
      prepMinutes: 20,
      actor: { type: 'system' },
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const res = applyTransition(accepted.order, 'READY', { now: new Date('2026-09-25T12:10:00Z'), actor: { type: 'system' } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.order.state).toBe('READY');
  });

  it('refuses OUT_FOR_DELIVERY for collection', () => {
    const order = makeOrder({ state: 'ACCEPTED', readyAt: '2026-09-25T12:20:00.000Z', prepMinutes: 20 });
    const res = applyTransition(order, 'OUT_FOR_DELIVERY', { now: new Date('2026-09-25T12:00:00Z'), actor: { type: 'system' } });
    expect(res).toEqual({ ok: false, error: 'OUT_FOR_DELIVERY is only for delivery orders' });
  });

  it('refuses READY for delivery', () => {
    const order = makeOrder({ fulfilmentMode: 'delivery', state: 'ACCEPTED', readyAt: '2026-09-25T12:20:00.000Z', prepMinutes: 20 });
    const res = applyTransition(order, 'READY', { now: new Date('2026-09-25T12:00:00Z'), actor: { type: 'system' } });
    expect(res).toEqual({ ok: false, error: 'READY is only for collection and dine-in orders' });
  });

  it('refuses cancel once in preparation', () => {
    const order = makeOrder({ state: 'ACCEPTED', readyAt: '2026-09-25T12:20:00.000Z', prepMinutes: 20 });
    const res = applyTransition(order, 'CANCELLED', { now: new Date('2026-09-25T12:05:00Z'), actor: { type: 'system' }, reason: 'x' });
    expect(res).toEqual({ ok: false, error: 'Cannot cancel once preparation has started' });
  });

  it('cancels a scheduled accepted order before its prep window', () => {
    const order = makeOrder({ state: 'ACCEPTED', readyAt: '2026-09-27T18:00:00.000Z', prepMinutes: 20 });
    const res = applyTransition(order, 'CANCELLED', {
      now: new Date('2026-09-25T12:00:00Z'),
      actor: { type: 'system' },
      reason: 'Customer called',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.order.state).toBe('CANCELLED');
  });

  it('completes a ready order', () => {
    const order = makeOrder({ state: 'READY' });
    const res = applyTransition(order, 'COMPLETED', { now: new Date('2026-09-25T12:00:00Z'), actor: { type: 'system' } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.order.state).toBe('COMPLETED');
  });

  it('refuses leaving COMPLETED', () => {
    const order = makeOrder({ state: 'COMPLETED' });
    const res = applyTransition(order, 'COMPLETED', { now: new Date('2026-09-25T12:00:00Z'), actor: { type: 'system' } });
    expect(res).toEqual({ ok: false, error: 'Cannot move from COMPLETED to COMPLETED' });
  });

  it('refuses setting IN_PREPARATION', () => {
    const order = makeOrder({ state: 'ACCEPTED', readyAt: '2026-09-25T12:20:00.000Z', prepMinutes: 20 });
    const res = applyTransition(order, 'IN_PREPARATION', { now: new Date('2026-09-25T12:00:00Z'), actor: { type: 'system' } });
    expect(res).toEqual({ ok: false, error: 'IN_PREPARATION is derived and cannot be set' });
  });

  it('does not mutate its input', () => {
    const order = makeOrder();
    applyTransition(order, 'ACCEPTED', {
      now: new Date('2026-09-25T12:00:00Z'),
      readyAt: new Date('2026-09-25T12:20:00Z'),
      prepMinutes: 20,
      actor: { type: 'system' },
    });
    expect(order.history).toHaveLength(1);
  });
});

describe('deriveDisplayState', () => {
  it('asap accepted order is in preparation', () => {
    const order = makeOrder({ state: 'ACCEPTED', readyAt: '2026-09-25T12:20:00.000Z', prepMinutes: 20 });
    expect(deriveDisplayState(order, new Date('2026-09-25T12:00:00Z'))).toBe('IN_PREPARATION');
  });

  it('scheduled accepted order is not yet in preparation', () => {
    const order = makeOrder({ state: 'ACCEPTED', readyAt: '2026-09-27T18:00:00.000Z', prepMinutes: 20 });
    expect(deriveDisplayState(order, new Date('2026-09-25T12:00:00Z'))).toBe('ACCEPTED');
  });

  it('terminal states display as stored', () => {
    const order = makeOrder({ state: 'READY' });
    expect(deriveDisplayState(order, new Date('2026-09-25T12:00:00Z'))).toBe('READY');
  });
});
