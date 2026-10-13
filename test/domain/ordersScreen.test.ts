import { describe, expect, it } from 'vitest';
import { isWatchedAt, ordersScreenDocId } from '../../src/domain/order/ordersScreen';

describe('orders screen presence', () => {
  it('never seen is not watched', () => {
    expect(isWatchedAt(null, new Date('2026-10-05T10:00:00Z'))).toBe(false);
  });

  it('seen exactly 3 minutes ago is watched, a millisecond later is not', () => {
    expect(isWatchedAt('2026-10-05T10:00:00.000Z', new Date('2026-10-05T10:03:00.000Z'))).toBe(true);
    expect(isWatchedAt('2026-10-05T10:00:00.000Z', new Date('2026-10-05T10:03:00.001Z'))).toBe(false);
  });

  it('an unreadable time is not watched', () => {
    expect(isWatchedAt('garbage', new Date('2026-10-05T10:00:00Z'))).toBe(false);
  });

  it('the record id is orders_screen_ plus the shop id', () => {
    expect(ordersScreenDocId('shop-1')).toBe('orders_screen_shop-1');
  });
});
