import { describe, expect, it } from 'vitest';
import {
  parseSlotCapacity,
  placeSlotOf,
  placesTaken,
  slotCapacityOf,
  slotDayOf,
  slotStartOf,
  withPlace,
  withoutPlace,
  type SlotPlace,
  type SlotPlacesDoc,
} from '../../src/domain/order/slotCapacity';

const now = new Date('2026-10-05T10:00:00Z');
const S = '2026-10-06T16:00:00.000Z';
const ids = { shopId: 'shop-1', day: '2026-10-06' };
const day = (places: SlotPlace[]): SlotPlacesDoc => ({
  id: 'slots_shop-1_2026-10-06',
  kind: 'slot_places',
  shopId: 'shop-1',
  day: '2026-10-06',
  places,
  updatedAt: 'x',
});
const B: SlotPlace = { orderId: 'b', slot: S, heldUntil: '2026-10-05T10:20:00.000Z' };

describe('slot capacity', () => {
  it('the limit applies only while orders for later are on', () => {
    expect(slotCapacityOf({ orderSettings: { scheduledOrders: true, slotCapacity: 4 } })).toBe(4);
    expect(slotCapacityOf({ orderSettings: { scheduledOrders: false, slotCapacity: 4 } })).toBeNull();
    expect(slotCapacityOf({})).toBeNull();
    expect(slotCapacityOf({ orderSettings: { scheduledOrders: true } })).toBeNull();
  });

  it('an instant falls in its quarter hour', () => {
    expect(slotStartOf(new Date('2026-10-05T10:29:59.999Z'))).toBe('2026-10-05T10:15:00.000Z');
    expect(slotStartOf(new Date('2026-10-05T10:30:00.000Z'))).toBe('2026-10-05T10:30:00.000Z');
  });

  it('an order occupies its booked time, else the quarter hour it is ready', () => {
    expect(placeSlotOf({ scheduledFor: '2026-10-05T16:00:00.000Z', readyAt: '2026-10-05T16:30:00.000Z' })).toBe(
      '2026-10-05T16:00:00.000Z',
    );
    expect(placeSlotOf({ readyAt: '2026-10-05T10:25:00.000Z' })).toBe('2026-10-05T10:15:00.000Z');
    expect(placeSlotOf({})).toBeNull();
  });

  it("a slot belongs to the restaurant's day, also after midnight and across the clock change", () => {
    expect(slotDayOf('2026-10-05T21:45:00.000Z', 'Europe/Berlin')).toBe('2026-10-05');
    expect(slotDayOf('2026-10-05T22:00:00.000Z', 'Europe/Berlin')).toBe('2026-10-06');
    expect(slotDayOf('2026-10-25T00:15:00.000Z', 'Europe/Berlin')).toBe('2026-10-25');
    expect(slotDayOf('2026-10-25T01:15:00.000Z', 'Europe/Berlin')).toBe('2026-10-25');
    expect(
      placesTaken(
        [
          day([
            { orderId: 'a', slot: '2026-10-25T00:15:00.000Z', heldUntil: null },
            { orderId: 'b', slot: '2026-10-25T01:15:00.000Z', heldUntil: null },
          ]),
        ],
        now,
      ),
    ).toEqual({ '2026-10-25T00:15:00.000Z': 1, '2026-10-25T01:15:00.000Z': 1 });
  });

  it('a place is refused once the limit is reached', () => {
    const D = day([{ orderId: 'a', slot: S, heldUntil: null }]);
    expect(withPlace(D, ids, B, 1, now)).toBe('full');
    const two = withPlace(D, ids, B, 2, now) as SlotPlacesDoc;
    expect(two.places).toEqual([{ orderId: 'a', slot: S, heldUntil: null }, B]);
    expect(two.updatedAt).toBe('2026-10-05T10:00:00.000Z');
    expect(withPlace(D, ids, { ...B, slot: '2026-10-06T16:15:00.000Z' }, 1, now)).not.toBe('full');
  });

  it('a lapsed hold neither counts nor stays', () => {
    const D = day([{ orderId: 'a', slot: S, heldUntil: '2026-10-05T09:59:59.000Z' }]);
    expect(placesTaken([D], now)).toEqual({});
    expect((withPlace(D, ids, B, 1, now) as SlotPlacesDoc).places).toEqual([B]);
  });

  it('a new place replaces the same order\'s earlier one', () => {
    const D = day([{ orderId: 'b', slot: S, heldUntil: '2026-10-05T10:10:00.000Z' }]);
    const res = withPlace(D, ids, { orderId: 'b', slot: S, heldUntil: null }, 1, now) as SlotPlacesDoc;
    expect(res.places).toEqual([{ orderId: 'b', slot: S, heldUntil: null }]);
  });

  it('without a limit a place is always added', () => {
    const res = withPlace(
      day([{ orderId: 'a', slot: S, heldUntil: null }]),
      ids,
      { orderId: 'b', slot: S, heldUntil: null },
      null,
      now,
    ) as SlotPlacesDoc;
    expect(res.places).toHaveLength(2);
    expect(withPlace(null, ids, B, 1, now)).toEqual({
      id: 'slots_shop-1_2026-10-06',
      kind: 'slot_places',
      shopId: 'shop-1',
      day: '2026-10-06',
      places: [B],
      updatedAt: '2026-10-05T10:00:00.000Z',
    });
  });

  it('removing a place the day does not hold writes nothing', () => {
    expect(withoutPlace(day([{ orderId: 'a', slot: S, heldUntil: null }]), 'zzz', now)).toBeNull();
    expect(withoutPlace(null, 'a', now)).toBeNull();
    const res = withoutPlace(
      day([
        { orderId: 'a', slot: S, heldUntil: null },
        { orderId: 'c', slot: S, heldUntil: '2026-10-05T09:00:00.000Z' },
      ]),
      'a',
      now,
    );
    expect(res?.places).toEqual([]);
    expect(res?.updatedAt).toBe('2026-10-05T10:00:00.000Z');
  });

  it('reads the owner limit', () => {
    expect(parseSlotCapacity(null)).toBeNull();
    expect(parseSlotCapacity(1)).toBe(1);
    expect(parseSlotCapacity(50)).toBe(50);
    for (const bad of [0, 51, 2.5, '4', true]) expect(parseSlotCapacity(bad)).toBe('invalid');
  });
});
