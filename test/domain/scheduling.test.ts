import { describe, expect, it } from 'vitest';
import {
  autoAcceptsOrder,
  isBookableSlot,
  isOpenAtSlot,
  isUpcoming,
  listSlots,
  parseSlotStart,
  queueEntryAt,
  readyAtFor,
  slotWithinHours,
} from '../../src/domain/order/scheduling';
import {
  CARD_SHOP,
  DELIVERY_ZONE,
  NOW_CLOSED,
  NOW_OPEN,
  PLACED_CARD_ORDER,
  SCHEDULED_ORDER,
  SCHEDULED_SHOP,
  SLOT_1800,
} from '../fixtures/orders';

const BUSY = { extraMinutes: 20, serviceDate: '2026-10-05', startedAt: '2026-10-05T09:00:00.000Z' };
const d = (iso: string) => new Date(iso);
const CLOSURE_SHOP = {
  ...SCHEDULED_SHOP,
  closures: [{ id: 'c', start: '2026-10-05T15:00:00.000Z', end: '2026-10-05T18:00:00.000Z' }],
};

describe('scheduling', () => {
  it('reads a slot start', () => {
    expect(parseSlotStart('2026-10-06T16:00:00.000Z')?.toISOString()).toBe('2026-10-06T16:00:00.000Z');
    expect(parseSlotStart('2026-10-06T18:00:00+02:00')?.toISOString()).toBe('2026-10-06T16:00:00.000Z');
    for (const bad of ['2026-10-06T16:10:00.000Z', '2026-10-06T16:00:30.000Z', 'tomorrow', '2026-10-06', 1760000000000, null]) {
      expect(parseSlotStart(bad)).toBeNull();
    }
  });

  it('a slot needs the kitchen open one ready time before it', () => {
    expect(slotWithinHours(SCHEDULED_SHOP, 'collection', d('2026-10-06T09:15:00.000Z'))).toBe(false);
    expect(slotWithinHours(SCHEDULED_SHOP, 'collection', d('2026-10-06T09:30:00.000Z'))).toBe(true);
    expect(slotWithinHours(SCHEDULED_SHOP, 'collection', d('2026-10-05T20:00:00.000Z'))).toBe(true);
    expect(slotWithinHours(SCHEDULED_SHOP, 'collection', d('2026-10-05T20:15:00.000Z'))).toBe(false);
    const noLead = { ...SCHEDULED_SHOP, orderSettings: { scheduledOrders: true, lastOrdersMinutes: 0 } };
    expect(slotWithinHours(noLead, 'collection', d('2026-10-05T20:15:00.000Z'))).toBe(true);
  });

  it('a slot can be booked up to exactly 96 hours ahead', () => {
    const book = (iso: string) => isBookableSlot(SCHEDULED_SHOP, 'collection', d(iso), NOW_OPEN);
    expect(book('2026-10-05T10:30:00.000Z')).toBe(true);
    expect(book('2026-10-05T10:15:00.000Z')).toBe(false);
    expect(book('2026-10-05T10:20:00.000Z')).toBe(false);
    expect(book('2026-10-09T10:00:00.000Z')).toBe(true);
    expect(book('2026-10-09T10:15:00.000Z')).toBe(false);
  });

  it('only collection and delivery, only when switched on', () => {
    const slot = d('2026-10-05T10:30:00.000Z');
    expect(isBookableSlot(CARD_SHOP, 'collection', slot, NOW_OPEN)).toBe(false);
    expect(isBookableSlot(SCHEDULED_SHOP, 'dine_in', slot, NOW_OPEN)).toBe(false);
    expect(listSlots(CARD_SHOP, 'collection', NOW_OPEN)).toEqual([]);
    expect(listSlots(SCHEDULED_SHOP, 'dine_in', NOW_OPEN)).toEqual([]);
  });

  it('a closure removes its slots', () => {
    const shop = {
      ...SCHEDULED_SHOP,
      closures: [{ id: 'c', start: '2026-10-06T00:00:00.000Z', end: '2026-10-07T00:00:00.000Z' }],
    };
    expect(isBookableSlot(shop, 'collection', d('2026-10-06T16:00:00.000Z'), NOW_OPEN)).toBe(false);
    expect(isBookableSlot(shop, 'collection', d('2026-10-07T16:00:00.000Z'), NOW_OPEN)).toBe(true);
  });

  it('busy mode pushes the earliest slot later', () => {
    const shop = { ...SCHEDULED_SHOP, busyMode: BUSY };
    expect(isBookableSlot(shop, 'collection', d('2026-10-05T10:30:00.000Z'), NOW_OPEN)).toBe(false);
    expect(isBookableSlot(shop, 'collection', d('2026-10-05T10:45:00.000Z'), NOW_OPEN)).toBe(true);
  });

  it('lists every free quarter hour', () => {
    const open = listSlots(SCHEDULED_SHOP, 'collection', NOW_OPEN);
    expect(open).toHaveLength(171);
    expect(open[0]).toBe('2026-10-05T10:30:00.000Z');
    expect(open[1]).toBe('2026-10-05T10:45:00.000Z');
    expect(open[open.length - 1]).toBe('2026-10-09T10:00:00.000Z');
    const closed = listSlots(SCHEDULED_SHOP, 'collection', NOW_CLOSED);
    expect(closed).toHaveLength(172);
    expect(closed[0]).toBe('2026-10-06T09:30:00.000Z');
    expect(closed[closed.length - 1]).toBe('2026-10-09T20:00:00.000Z');
    const delivery = listSlots(
      { ...SCHEDULED_SHOP, orderSettings: { scheduledOrders: true, delivery: true, deliveryZones: [DELIVERY_ZONE] } },
      'delivery',
      NOW_CLOSED,
    );
    expect(delivery).toHaveLength(168);
    expect(delivery[0]).toBe('2026-10-06T09:45:00.000Z');
  });

  it('the clock change gives two different slots with the same local time', () => {
    const ALL = [{ open: '00:00', close: '00:00' }];
    const S = { ...SCHEDULED_SHOP, openingHours: { mon: ALL, tue: ALL, wed: ALL, thu: ALL, fri: ALL, sat: ALL, sun: ALL } };
    expect(listSlots(S, 'collection', d('2026-10-24T23:00:00Z')).slice(0, 8)).toEqual([
      '2026-10-24T23:30:00.000Z',
      '2026-10-24T23:45:00.000Z',
      '2026-10-25T00:00:00.000Z',
      '2026-10-25T00:15:00.000Z',
      '2026-10-25T00:30:00.000Z',
      '2026-10-25T00:45:00.000Z',
      '2026-10-25T01:00:00.000Z',
      '2026-10-25T01:15:00.000Z',
    ]);
  });

  it('a scheduled order is upcoming until one ready time before', () => {
    expect(isUpcoming(SCHEDULED_ORDER, SCHEDULED_SHOP, d('2026-10-05T15:39:00Z'))).toBe(true);
    expect(isUpcoming(SCHEDULED_ORDER, SCHEDULED_SHOP, d('2026-10-05T15:40:00Z'))).toBe(false);
    expect(
      isUpcoming({ ...SCHEDULED_ORDER, queuedAt: '2026-10-05T15:00:00.000Z' }, SCHEDULED_SHOP, d('2026-10-05T15:00:00Z')),
    ).toBe(false);
    expect(isUpcoming(PLACED_CARD_ORDER, SCHEDULED_SHOP, NOW_OPEN)).toBe(false);
    expect(isUpcoming({ ...SCHEDULED_ORDER, state: 'REJECTED' }, SCHEDULED_SHOP, NOW_OPEN)).toBe(false);
    expect(queueEntryAt(SCHEDULED_SHOP, SCHEDULED_ORDER, NOW_OPEN)?.toISOString()).toBe('2026-10-05T15:40:00.000Z');
    expect(queueEntryAt(SCHEDULED_SHOP, PLACED_CARD_ORDER, NOW_OPEN)).toBeNull();
  });

  it('busy mode brings a scheduled order in earlier', () => {
    const shop = { ...SCHEDULED_SHOP, busyMode: BUSY };
    expect(isUpcoming(SCHEDULED_ORDER, shop, d('2026-10-05T15:19:00Z'))).toBe(true);
    expect(isUpcoming(SCHEDULED_ORDER, shop, d('2026-10-05T15:20:00Z'))).toBe(false);
  });

  it('knows when the restaurant is closed at the booked time', () => {
    expect(isOpenAtSlot(SCHEDULED_SHOP, 'collection', d(SLOT_1800))).toBe(true);
    expect(isOpenAtSlot(CLOSURE_SHOP, 'collection', d(SLOT_1800))).toBe(false);
    expect(isOpenAtSlot({ ...SCHEDULED_SHOP, openingHours: { ...SCHEDULED_SHOP.openingHours, mon: [] } }, 'collection', d(SLOT_1800))).toBe(false);
  });

  it('accepts a scheduled order automatically only once it comes in, and only while open', () => {
    const queued = { ...SCHEDULED_ORDER, queuedAt: '2026-10-05T15:40:00.000Z' };
    expect(autoAcceptsOrder(SCHEDULED_SHOP, SCHEDULED_ORDER)).toBe(false);
    expect(autoAcceptsOrder(SCHEDULED_SHOP, queued)).toBe(true);
    expect(autoAcceptsOrder(CLOSURE_SHOP, queued)).toBe(false);
    expect(autoAcceptsOrder(SCHEDULED_SHOP, PLACED_CARD_ORDER)).toBe(true);
    const W = {
      ...SCHEDULED_SHOP,
      orderSettings: {
        scheduledOrders: true,
        autoAcceptHours: { mon: [{ open: '09:00', close: '18:00' }], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
      },
    };
    expect(
      autoAcceptsOrder(W, {
        ...SCHEDULED_ORDER,
        createdAt: '2026-10-05T08:00:00.000Z',
        scheduledFor: '2026-10-05T17:00:00.000Z',
        queuedAt: '2026-10-05T16:40:00.000Z',
      }),
    ).toBe(false);
  });

  it('keeps the booked time when accepted before it', () => {
    expect(readyAtFor(SCHEDULED_ORDER, d('2026-10-05T15:42:00Z'), 20).toISOString()).toBe('2026-10-05T16:00:00.000Z');
    expect(readyAtFor(SCHEDULED_ORDER, d('2026-10-05T16:10:00Z'), 20).toISOString()).toBe('2026-10-05T16:30:00.000Z');
    expect(readyAtFor(PLACED_CARD_ORDER, d('2026-10-05T10:05:00Z'), 20).toISOString()).toBe('2026-10-05T10:25:00.000Z');
  });
});
