import { describe, expect, it } from 'vitest';
import { shopRefusalForPaidCheckout } from '../../src/domain/order/shopAvailability';
import { CARD_SHOP, SCHEDULED_SHOP, SLOT_1800 } from '../fixtures/orders';

const S = { createdAt: '2026-10-05T09:59:00.000Z', fulfilmentMode: 'collection' as const };
const closure = { id: 'c1', start: '2026-10-05T00:00:00Z', end: '2026-10-06T00:00:00Z' };
const deliveryShop = {
  ...CARD_SHOP,
  orderSettings: {
    deliveryHours: { mon: [{ open: '17:00', close: '22:00' }], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
  },
};

describe('shopRefusalForPaidCheckout', () => {
  it('an open shop takes the order', () => {
    expect(shopRefusalForPaidCheckout(CARD_SHOP, S)).toBeNull();
  });

  it('paused, owner offline and platform offline each refuse', () => {
    expect(shopRefusalForPaidCheckout({ ...CARD_SHOP, ordersPaused: true }, S)).toBe('orders_paused');
    expect(shopRefusalForPaidCheckout({ ...CARD_SHOP, isPaused: true }, S)).toBe('offline');
    expect(shopRefusalForPaidCheckout({ ...CARD_SHOP, isPaused: true, offlineBySuperadmin: true }, S)).toBe('offline_by_superadmin');
  });

  it('an expired pause is no refusal', () => {
    const paused = { ...CARD_SHOP, ordersPaused: true, ordersPausedUntil: '2026-10-05T09:59:30.000Z' };
    expect(shopRefusalForPaidCheckout(paused, S, new Date('2026-10-05T10:00:00Z'))).toBeNull();
    expect(shopRefusalForPaidCheckout(paused, S, new Date('2026-10-05T09:59:00Z'))).toBe('orders_paused');
  });

  it('a holiday closure over checkout time refuses', () => {
    expect(shopRefusalForPaidCheckout({ ...CARD_SHOP, closures: [closure] }, S)).toBe('closed');
  });

  it('delivery follows its own hours', () => {
    expect(shopRefusalForPaidCheckout(deliveryShop, { ...S, fulfilmentMode: 'delivery' })).toBe('closed');
    expect(shopRefusalForPaidCheckout(deliveryShop, S)).toBeNull();
  });

  it('a booked slot inside a closure refuses', () => {
    const closed = { ...SCHEDULED_SHOP, closures: [{ id: 'c1', start: '2026-10-05T14:00:00Z', end: '2026-10-05T18:00:00Z' }] };
    expect(shopRefusalForPaidCheckout(closed, { ...S, scheduledFor: SLOT_1800 })).toBe('closed');
    expect(shopRefusalForPaidCheckout(SCHEDULED_SHOP, { ...S, scheduledFor: SLOT_1800 })).toBeNull();
  });
});
