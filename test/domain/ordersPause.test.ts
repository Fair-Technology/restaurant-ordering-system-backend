import { describe, expect, it } from 'vitest';
import {
  isOrdersPausedAt,
  missedOrdersPauseLimitOf,
  ordersPauseEndAt,
  ordersPauseFieldsOf,
} from '../../src/domain/shop/ordersPause';

const d = (iso: string) => new Date(iso);

describe('isOrdersPausedAt', () => {
  it('a pause with no end lasts until switched back', () => {
    expect(isOrdersPausedAt({ ordersPaused: true }, d('2030-01-01T00:00:00Z'))).toBe(true);
    expect(isOrdersPausedAt({ ordersPaused: true, ordersPausedUntil: null }, d('2030-01-01T00:00:00Z'))).toBe(true);
  });
  it('a timed pause ends at its end time exactly', () => {
    const shop = { ordersPaused: true, ordersPausedUntil: '2026-10-17T12:30:00.000Z' };
    expect(isOrdersPausedAt(shop, d('2026-10-17T12:29:59.999Z'))).toBe(true);
    expect(isOrdersPausedAt(shop, d('2026-10-17T12:30:00.000Z'))).toBe(false);
  });
  it('not paused stays not paused', () => {
    expect(isOrdersPausedAt({ ordersPaused: false, ordersPausedUntil: '2099-01-01T00:00:00.000Z' }, d('2026-10-17T12:00:00Z'))).toBe(false);
    expect(isOrdersPausedAt({}, d('2026-10-17T12:00:00Z'))).toBe(false);
  });
  it('an unreadable end counts as paused', () => {
    expect(isOrdersPausedAt({ ordersPaused: true, ordersPausedUntil: 'garbage' }, d('2026-10-17T12:00:00Z'))).toBe(true);
  });
});

describe('ordersPauseEndAt', () => {
  const B = 'Europe/Berlin';
  it('30 minutes from now', () => {
    expect(ordersPauseEndAt('minutes_30', B, d('2026-10-17T12:00:00Z'))).toBe('2026-10-17T12:30:00.000Z');
  });
  it('until switched back has no end', () => {
    expect(ordersPauseEndAt('until_switched_back', B, d('2026-10-17T12:00:00Z'))).toBeNull();
  });
  it('rest of today ends at 04:00 local, not midnight', () => {
    expect(ordersPauseEndAt('rest_of_day', B, d('2026-10-17T20:00:00Z'))).toBe('2026-10-18T02:00:00.000Z');
  });
  it('after midnight it still ends at 04:00 the same night', () => {
    expect(ordersPauseEndAt('rest_of_day', B, d('2026-10-18T00:30:00Z'))).toBe('2026-10-18T02:00:00.000Z');
    expect(ordersPauseEndAt('rest_of_day', B, d('2026-10-18T01:59:59Z'))).toBe('2026-10-18T02:00:00.000Z');
  });
  it('at 04:00 a new day has begun', () => {
    expect(ordersPauseEndAt('rest_of_day', B, d('2026-10-18T02:00:00Z'))).toBe('2026-10-19T02:00:00.000Z');
  });
  it('the night the clocks go back: 04:00 is CET, so 03:00Z', () => {
    expect(ordersPauseEndAt('rest_of_day', B, d('2026-10-24T20:00:00Z'))).toBe('2026-10-25T03:00:00.000Z');
    expect(ordersPauseEndAt('rest_of_day', B, d('2026-10-24T21:30:00Z'))).toBe('2026-10-25T03:00:00.000Z');
  });
  it('the night the clocks go forward: 04:00 is CEST, so 02:00Z', () => {
    expect(ordersPauseEndAt('rest_of_day', B, d('2026-03-28T22:30:00Z'))).toBe('2026-03-29T02:00:00.000Z');
  });
  it('Sydney when daylight saving starts', () => {
    expect(ordersPauseEndAt('rest_of_day', 'Australia/Sydney', d('2026-10-03T12:00:00Z'))).toBe('2026-10-03T17:00:00.000Z');
  });
  it('a quarter-hour zone', () => {
    expect(ordersPauseEndAt('rest_of_day', 'Asia/Kathmandu', d('2026-10-17T10:00:00Z'))).toBe('2026-10-17T22:15:00.000Z');
  });
});

describe('ordersPauseFieldsOf', () => {
  it('pause fields hide an expired pause', () => {
    expect(
      ordersPauseFieldsOf({ ordersPaused: true, ordersPausedUntil: '2026-10-17T12:00:00.000Z', ordersAutoPaused: null }, d('2026-10-17T12:00:00.000Z')),
    ).toEqual({ ordersPaused: false, ordersPausedUntil: null, ordersAutoPaused: null });
  });
  it('pause fields name an automatic pause', () => {
    expect(ordersPauseFieldsOf({ ordersPaused: true, ordersAutoPaused: { missedOrders: 3, at: 'x' } }, d('2026-10-17T12:00:00Z'))).toEqual({
      ordersPaused: true,
      ordersPausedUntil: null,
      ordersAutoPaused: { missedOrders: 3, at: 'x' },
    });
  });
});

describe('missedOrdersPauseLimitOf', () => {
  it('limit defaults to 3', () => {
    expect(missedOrdersPauseLimitOf({})).toBe(3);
    expect(missedOrdersPauseLimitOf({ missedOrdersPauseLimit: 0 })).toBe(0);
    expect(missedOrdersPauseLimitOf({ missedOrdersPauseLimit: 7 })).toBe(7);
    expect(missedOrdersPauseLimitOf({ missedOrdersPauseLimit: 11 })).toBe(3);
    expect(missedOrdersPauseLimitOf({ missedOrdersPauseLimit: 2.5 })).toBe(3);
  });
});
