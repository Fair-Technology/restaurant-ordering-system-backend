import { describe, expect, it } from 'vitest';
import { offeredPaymentMethods } from '../../src/domain/order/paymentMethods';
import {
  IDEMPOTENCY_KEY_PATTERN,
  accessTokenMatches,
  generateAccessToken,
  orderIdForIdempotencyKey,
} from '../../src/domain/order/orderIds';
import { isDueForAutoComplete, isDueForAutoReject, isDueForEscalation } from '../../src/domain/order/orderTimers';
import { addressRequired } from '../../src/domain/order/Order';
import { escalationRecipients, orderSettingsOf } from '../../src/domain/order/orderSettings';
import { orderableModesFor } from '../../src/domain/order/fulfilment';
import { CARD_SHOP, DELIVERY_ZONE, PLACED_CARD_ORDER } from '../fixtures/orders';

describe('order rules', () => {
  it('offers card only once Stripe is ready', () => {
    expect(offeredPaymentMethods({ stripe: { connectOnboardingStatus: 'complete' } })).toEqual(['card']);
    expect(offeredPaymentMethods({ stripe: { connectOnboardingStatus: 'pending' } })).toEqual([]);
    expect(offeredPaymentMethods({ stripe: null })).toEqual([]);
  });

  it('auto-accept is on unless switched off', () => {
    expect(orderSettingsOf({})).toEqual({
      autoRejectMinutes: 10,
      alertEmail: null,
      autoAccept: true,
      dineIn: false,
      autoAcceptHours: null,
      prepMinutes: { collection: 20, delivery: 45, dine_in: 20 },
      lastOrdersMinutes: null,
      busyExtraMinutes: 20,
      delivery: false,
      deliveryHours: null,
      deliveryZones: [],
      deliveryFeeTaxClassId: null,
    });
    expect(
      orderSettingsOf({ orderSettings: { autoRejectMinutes: 15, alertEmail: null, autoAccept: false } }).autoAccept,
    ).toBe(false);
    expect(orderSettingsOf({ orderSettings: { autoRejectMinutes: 15, alertEmail: null } }).autoAccept).toBe(true);
  });

  it("a stored prep time keeps the other modes' defaults", () => {
    expect(orderSettingsOf({ orderSettings: { prepMinutes: { dine_in: 30 } } }).prepMinutes).toEqual({
      collection: 20,
      delivery: 45,
      dine_in: 30,
    });
  });

  it('dine-in is off until switched on', () => {
    expect(orderableModesFor({})).toEqual(['collection']);
    expect(
      orderableModesFor({ orderSettings: { autoRejectMinutes: 10, alertEmail: null, autoAccept: true, dineIn: true } }),
    ).toEqual(['collection', 'dine_in']);
  });

  it('delivery is offered only when switched on with at least one postcode', () => {
    expect(orderableModesFor({ orderSettings: { delivery: true, deliveryZones: [DELIVERY_ZONE] } })).toEqual(['collection', 'delivery']);
    expect(orderableModesFor({ orderSettings: { delivery: true, deliveryZones: [] } })).toEqual(['collection']);
    expect(orderableModesFor({ orderSettings: { delivery: false, deliveryZones: [DELIVERY_ZONE] } })).toEqual(['collection']);
    expect(orderableModesFor({ orderSettings: { delivery: true, deliveryZones: [DELIVERY_ZONE], dineIn: true } })).toEqual([
      'collection',
      'delivery',
      'dine_in',
    ]);
  });

  it('delivered orders complete after local midnight', () => {
    const o = { state: 'OUT_FOR_DELIVERY' as const, readyAt: '2026-10-05T19:00:00.000Z', updatedAt: 'x' };
    expect(isDueForAutoComplete(o, new Date('2026-10-05T21:59:00Z'), 'Europe/Berlin')).toBe(false);
    expect(isDueForAutoComplete(o, new Date('2026-10-05T22:00:00Z'), 'Europe/Berlin')).toBe(true);
  });

  it('an address is needed only above 250 euros', () => {
    expect(addressRequired(25000)).toBe(false);
    expect(addressRequired(25001)).toBe(true);
  });

  it('derives the same order id from the same key', () => {
    const a = orderIdForIdempotencyKey('shop-1', 'key-12345678');
    expect(a).toBe(orderIdForIdempotencyKey('shop-1', 'key-12345678'));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(orderIdForIdempotencyKey('shop-2', 'key-12345678'));
  });

  it('accepts only sane idempotency keys', () => {
    expect(IDEMPOTENCY_KEY_PATTERN.test('abc')).toBe(false);
    expect(IDEMPOTENCY_KEY_PATTERN.test('a'.repeat(65))).toBe(false);
    expect(IDEMPOTENCY_KEY_PATTERN.test('bad key!')).toBe(false);
    expect(IDEMPOTENCY_KEY_PATTERN.test('3f2c9a1e-7b4d-4c1a-9f0e-2a6b8c7d5e4f')).toBe(true);
  });

  it('access tokens are long and random', () => {
    const t = generateAccessToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(generateAccessToken()).not.toBe(t);
  });

  it('token comparison', () => {
    const t = 'T'.repeat(32);
    expect(accessTokenMatches(t, t)).toBe(true);
    expect(accessTokenMatches(t, 'x')).toBe(false);
    expect(accessTokenMatches(undefined, 'x')).toBe(false);
    expect(accessTokenMatches(t, 5)).toBe(false);
  });

  it('escalation is due after three minutes', () => {
    expect(isDueForEscalation(PLACED_CARD_ORDER, new Date('2026-10-05T10:02:59Z'))).toBe(false);
    expect(isDueForEscalation(PLACED_CARD_ORDER, new Date('2026-10-05T10:03:00Z'))).toBe(true);
    const later = new Date('2026-10-05T10:03:00Z');
    expect(isDueForEscalation({ ...PLACED_CARD_ORDER, escalatedAt: '2026-10-05T10:03:00.000Z' }, later)).toBe(false);
    expect(isDueForEscalation({ ...PLACED_CARD_ORDER, state: 'ACCEPTED' }, later)).toBe(false);
  });

  it('auto-reject is due at the deadline', () => {
    expect(isDueForAutoReject(PLACED_CARD_ORDER, new Date('2026-10-05T10:09:59Z'))).toBe(false);
    expect(isDueForAutoReject(PLACED_CARD_ORDER, new Date('2026-10-05T10:10:00Z'))).toBe(true);
    expect(isDueForAutoReject({ ...PLACED_CARD_ORDER, autoRejectAt: undefined }, new Date('2026-10-05T10:10:00Z'))).toBe(
      false,
    );
  });

  it('ready orders complete after local midnight', () => {
    const o = { state: 'READY' as const, readyAt: '2026-10-05T19:00:00.000Z', updatedAt: 'x' };
    expect(isDueForAutoComplete(o, new Date('2026-10-05T21:59:00Z'), 'Europe/Berlin')).toBe(false);
    expect(isDueForAutoComplete(o, new Date('2026-10-05T22:00:00Z'), 'Europe/Berlin')).toBe(true);
  });

  it('escalation goes to the Impressum and alert addresses', () => {
    expect(escalationRecipients(CARD_SHOP)).toEqual(['info@mapasta.example']);
    expect(
      escalationRecipients({ ...CARD_SHOP, orderSettings: { autoRejectMinutes: 10, alertEmail: 'boss@mapasta.example', autoAccept: true } }),
    ).toEqual(['info@mapasta.example', 'boss@mapasta.example']);
    expect(
      escalationRecipients({ ...CARD_SHOP, orderSettings: { autoRejectMinutes: 10, alertEmail: 'INFO@mapasta.example', autoAccept: true } }),
    ).toEqual(['info@mapasta.example']);
  });
});
