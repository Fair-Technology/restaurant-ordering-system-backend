import { describe, expect, it } from 'vitest';
import { offeredPaymentMethods } from '../../src/domain/order/paymentMethods';
import {
  IDEMPOTENCY_KEY_PATTERN,
  accessTokenMatches,
  generateAccessToken,
  orderIdForIdempotencyKey,
} from '../../src/domain/order/orderIds';
import { isDueForAutoComplete, isDueForAutoReject, isDueForEscalation } from '../../src/domain/order/orderTimers';
import { escalationRecipients } from '../../src/domain/order/orderSettings';
import { CASH_SHOP, PLACED_CASH_ORDER } from '../fixtures/orders';

describe('order rules', () => {
  it('offers cash or card by payment setting', () => {
    expect(offeredPaymentMethods({ paymentPolicy: 'pay_in_person' })).toEqual(['cash']);
    expect(
      offeredPaymentMethods({ paymentPolicy: 'pay_online', stripe: { connectOnboardingStatus: 'complete' } }),
    ).toEqual(['card']);
    expect(offeredPaymentMethods({ paymentPolicy: 'pay_online', stripe: null })).toEqual([]);
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
    expect(isDueForEscalation(PLACED_CASH_ORDER, new Date('2026-10-05T10:02:59Z'))).toBe(false);
    expect(isDueForEscalation(PLACED_CASH_ORDER, new Date('2026-10-05T10:03:00Z'))).toBe(true);
    const later = new Date('2026-10-05T10:03:00Z');
    expect(isDueForEscalation({ ...PLACED_CASH_ORDER, escalatedAt: '2026-10-05T10:03:00.000Z' }, later)).toBe(false);
    expect(isDueForEscalation({ ...PLACED_CASH_ORDER, state: 'ACCEPTED' }, later)).toBe(false);
  });

  it('auto-reject is due at the deadline', () => {
    expect(isDueForAutoReject(PLACED_CASH_ORDER, new Date('2026-10-05T10:09:59Z'))).toBe(false);
    expect(isDueForAutoReject(PLACED_CASH_ORDER, new Date('2026-10-05T10:10:00Z'))).toBe(true);
    expect(isDueForAutoReject({ ...PLACED_CASH_ORDER, autoRejectAt: undefined }, new Date('2026-10-05T10:10:00Z'))).toBe(
      false,
    );
  });

  it('ready orders complete after local midnight', () => {
    const o = { state: 'READY' as const, readyAt: '2026-10-05T19:00:00.000Z', updatedAt: 'x' };
    expect(isDueForAutoComplete(o, new Date('2026-10-05T21:59:00Z'), 'Europe/Berlin')).toBe(false);
    expect(isDueForAutoComplete(o, new Date('2026-10-05T22:00:00Z'), 'Europe/Berlin')).toBe(true);
  });

  it('escalation goes to the Impressum and alert addresses', () => {
    expect(escalationRecipients(CASH_SHOP)).toEqual(['info@mapasta.example']);
    expect(
      escalationRecipients({ ...CASH_SHOP, orderSettings: { autoRejectMinutes: 10, alertEmail: 'boss@mapasta.example' } }),
    ).toEqual(['info@mapasta.example', 'boss@mapasta.example']);
    expect(
      escalationRecipients({ ...CASH_SHOP, orderSettings: { autoRejectMinutes: 10, alertEmail: 'INFO@mapasta.example' } }),
    ).toEqual(['info@mapasta.example']);
  });
});
