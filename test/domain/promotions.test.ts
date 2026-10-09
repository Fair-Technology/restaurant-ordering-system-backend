import { describe, expect, it } from 'vitest';
import {
  DISCOUNT_CODE_ERROR,
  DISCOUNT_CODE_RESERVED_ERROR,
  DISCOUNT_DATES_ERROR,
  DISCOUNT_LIMIT_ERROR,
  DISCOUNT_MINIMUM_ERROR,
  DISCOUNT_VALUE_ERROR,
  LOYALTY_RULE_ERROR,
  acceptsCodes,
  countsAsUse,
  generateVoucherCode,
  isVoucherCode,
  mergeLoyaltyRule,
  normaliseCode,
  parseNewDiscountCode,
  voucherExpiresOn,
} from '../../src/domain/promotion/promotions';
import { PROMOTIONS, PROMO_CODE } from '../fixtures/orders';

describe('promotions', () => {
  it('reads a code typed by a diner', () => {
    expect(normaliseCode(' welcome10 ')).toBe('WELCOME10');
    expect(normaliseCode('l-abcd2345')).toBe('L-ABCD2345');
    for (const bad of ['ab', 'WELCOME 10', 'KÄSE10', 12, null]) expect(normaliseCode(bad)).toBeNull();
  });

  it('voucher codes look like L- and eight characters', () => {
    expect(generateVoucherCode(() => 0)).toBe('L-AAAAAAAA');
    expect(isVoucherCode('L-AB2CD3EF')).toBe(true);
    expect(isVoucherCode('WELCOME10')).toBe(false);
    expect(isVoucherCode('L-AB2CD3E0')).toBe(false);
  });

  it('parses a new code with defaults', () => {
    expect(parseNewDiscountCode({ code: 'welcome10', kind: 'percent', percent: 10 }, { id: 'c1', now: new Date('2026-10-09T10:00:00Z') })).toEqual({
      id: 'c1', code: 'WELCOME10', kind: 'percent', percent: 10, amountCents: null, minSubtotalCents: 0, validFrom: null,
      validUntil: null, totalLimit: null, perEmailLimit: 1, active: true, createdAt: '2026-10-09T10:00:00.000Z',
    });
  });

  it('refuses bad code settings', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ code: 'L-ABCD2345', kind: 'amount', amountCents: 500 }, DISCOUNT_CODE_RESERVED_ERROR],
      [{ code: 'a', kind: 'percent', percent: 10 }, DISCOUNT_CODE_ERROR],
      [{ kind: 'percent', percent: 0 }, DISCOUNT_VALUE_ERROR],
      [{ kind: 'percent', percent: 101 }, DISCOUNT_VALUE_ERROR],
      [{ kind: 'amount', amountCents: 10001 }, DISCOUNT_VALUE_ERROR],
      [{ kind: 'gift', percent: 10 }, DISCOUNT_VALUE_ERROR],
      [{ kind: 'percent', percent: 10, minSubtotalCents: -1 }, DISCOUNT_MINIMUM_ERROR],
      [{ kind: 'percent', percent: 10, validFrom: '2026-13-01' }, DISCOUNT_DATES_ERROR],
      [{ kind: 'percent', percent: 10, validFrom: '2026-10-20', validUntil: '2026-10-10' }, DISCOUNT_DATES_ERROR],
      [{ kind: 'percent', percent: 10, totalLimit: 0 }, DISCOUNT_LIMIT_ERROR],
      [{ kind: 'percent', percent: 10, perEmailLimit: 101 }, DISCOUNT_LIMIT_ERROR],
    ];
    for (const [body, error] of cases) {
      expect(parseNewDiscountCode({ code: 'ABC', ...body }, { id: 'c1', now: new Date() })).toEqual({ error });
    }
  });

  it('counts a use unless the order ended before acceptance', () => {
    expect(countsAsUse({ state: 'PLACED' })).toBe(true);
    expect(countsAsUse({ state: 'REJECTED' })).toBe(false);
    expect(countsAsUse({ state: 'CANCELLED' })).toBe(false);
    expect(countsAsUse({ state: 'CANCELLED', acceptedAt: '2026-10-05T10:05:00.000Z' })).toBe(true);
    expect(countsAsUse({ state: 'COMPLETED', acceptedAt: '2026-10-05T10:05:00.000Z' })).toBe(true);
  });

  it('the loyalty rule restarts its count when switched on', () => {
    const now = new Date('2026-10-09T10:00:00Z');
    expect(mergeLoyaltyRule(null, { enabled: true, everyOrders: 5, rewardCents: 500 }, now)).toEqual({
      enabled: true, everyOrders: 5, rewardCents: 500, validDays: 90, since: '2026-10-09T10:00:00.000Z',
    });
    expect((mergeLoyaltyRule(PROMOTIONS.loyalty, { rewardCents: 700 }, now) as { since: string }).since).toBe('2026-10-01T00:00:00.000Z');
    expect((mergeLoyaltyRule({ ...PROMOTIONS.loyalty!, enabled: false }, { enabled: true }, now) as { since: string }).since).toBe(
      '2026-10-09T10:00:00.000Z',
    );
    for (const body of [{ everyOrders: 1 }, { rewardCents: 50 }, { validDays: 3 }, { enabled: 'yes' }]) {
      expect(mergeLoyaltyRule(null, body, now)).toEqual({ error: LOYALTY_RULE_ERROR });
    }
  });

  it('the code box shows while a code is live or loyalty was ever on', () => {
    const today = '2026-10-09';
    expect(acceptsCodes(null, today)).toBe(false);
    expect(acceptsCodes({ ...PROMOTIONS, codes: [{ ...PROMO_CODE, validUntil: '2026-10-08' }], loyalty: null }, today)).toBe(false);
    expect(acceptsCodes({ ...PROMOTIONS, codes: [{ ...PROMO_CODE, active: false }], loyalty: null }, today)).toBe(false);
    expect(acceptsCodes({ ...PROMOTIONS, loyalty: null }, today)).toBe(true);
    expect(acceptsCodes({ ...PROMOTIONS, codes: [], loyalty: { ...PROMOTIONS.loyalty!, enabled: false } }, today)).toBe(true);
  });

  it("a voucher's last day is in the restaurant's calendar", () => {
    expect(voucherExpiresOn(new Date('2026-10-09T10:00:00Z'), 90, 'Europe/Berlin')).toBe('2027-01-07');
    expect(voucherExpiresOn(new Date('2026-10-09T22:30:00Z'), 7, 'Europe/Berlin')).toBe('2026-10-17');
  });
});
