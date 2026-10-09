import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROMO_CODE, PROMOTIONS, VOUCHER } from '../../fixtures/orders';

const m = vi.hoisted(() => ({ findDiscountUseRows: vi.fn(), findVoucher: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({ findDiscountUseRows: m.findDiscountUseRows }));
vi.mock('../../../src/infrastructure/cosmos/promotion/CosmosPromotionRepository', () => ({ findVoucher: m.findVoucher }));

import { resolveDiscount } from '../../../src/application/promotion/resolveDiscount';

const shop = { id: 'shop-1', timezone: 'Europe/Berlin' };
const now = new Date('2026-10-09T10:00:00Z');
const promos = (over: Partial<typeof PROMO_CODE>) => ({ ...PROMOTIONS, codes: [{ ...PROMO_CODE, ...over }] });
const resolve = (over: Partial<typeof PROMO_CODE>, extra: Record<string, unknown> = {}) =>
  resolveDiscount({
    shop,
    promotions: promos(over),
    code: 'WELCOME10',
    subtotalCents: 1400,
    chargesCents: 0,
    emailLower: 'a@x.example',
    now,
    ...extra,
  });

beforeEach(() => {
  vi.resetAllMocks();
  m.findDiscountUseRows.mockResolvedValue([]);
});

describe('resolveDiscount limits', () => {
  it('declined and cancelled-before-acceptance orders do not use up a total limit', async () => {
    m.findDiscountUseRows.mockResolvedValue([
      { state: 'REJECTED', customerEmail: 'b@x.example' },
      { state: 'CANCELLED', customerEmail: 'c@x.example' },
    ]);
    expect(await resolve({ totalLimit: 1 })).toMatchObject({ ok: true });
  });

  it('a waiting or accepted order holds a use, even if cancelled later', async () => {
    m.findDiscountUseRows.mockResolvedValue([{ state: 'PLACED', customerEmail: 'b@x.example' }]);
    expect(await resolve({ totalLimit: 1 })).toMatchObject({ ok: false, problem: 'used_up' });
    m.findDiscountUseRows.mockResolvedValue([{ state: 'CANCELLED', acceptedAt: '2026-10-05T10:00:00Z', customerEmail: 'b@x.example' }]);
    expect(await resolve({ totalLimit: 1 })).toMatchObject({ ok: false, problem: 'used_up' });
  });

  it('the per-diner limit compares emails ignoring case and spaces, and ignores declined orders', async () => {
    m.findDiscountUseRows.mockResolvedValue([{ state: 'COMPLETED', acceptedAt: '2026-10-05T10:00:00Z', customerEmail: ' A@X.example ' }]);
    expect(await resolve({ perEmailLimit: 1 })).toMatchObject({ ok: false, problem: 'already_used' });
    expect(await resolve({ perEmailLimit: 2 })).toMatchObject({ ok: true });
    m.findDiscountUseRows.mockResolvedValue([{ state: 'REJECTED', customerEmail: 'a@x.example' }]);
    expect(await resolve({ perEmailLimit: 1 })).toMatchObject({ ok: true });
  });

  it('the quote (no email) skips the per-diner limit but still applies the total limit', async () => {
    m.findDiscountUseRows.mockResolvedValue([{ state: 'COMPLETED', acceptedAt: 'x', customerEmail: 'a@x.example' }]);
    expect(await resolve({ perEmailLimit: 1 }, { emailLower: null })).toMatchObject({ ok: true });
    expect(await resolve({ totalLimit: 1 }, { emailLower: null })).toMatchObject({ ok: false, problem: 'used_up' });
  });

  it('dates are inclusive in the restaurant calendar; minimum is checked on the dishes', async () => {
    expect(await resolve({ validUntil: '2026-10-09' })).toMatchObject({ ok: true });
    expect(await resolve({ validUntil: '2026-10-08' })).toMatchObject({ ok: false, problem: 'expired' });
    expect(await resolve({ validFrom: '2026-10-10' })).toMatchObject({ ok: false, problem: 'not_started' });
    expect(await resolve({ minSubtotalCents: 1500 })).toMatchObject({ ok: false, problem: 'minimum', minSubtotalCents: 1500 });
    expect(await resolve({ active: false })).toMatchObject({ ok: false, problem: 'unknown' });
  });

  it('the fee is not discounted and the card keeps 0,50 EUR', async () => {
    expect(await resolve({ kind: 'amount', percent: null, amountCents: 5000 }, { chargesCents: 250 })).toMatchObject({
      ok: true,
      offer: { cents: 1400 },
    });
    expect(await resolve({ kind: 'amount', percent: null, amountCents: 5000 })).toMatchObject({ ok: true, offer: { cents: 1350 } });
    expect(await resolve({}, { subtotalCents: 40 })).toMatchObject({ ok: false, problem: 'too_small' });
  });

  it('a voucher works once, until its last day, and is judged like a code otherwise', async () => {
    m.findVoucher.mockResolvedValue(VOUCHER);
    const v = (extra: Record<string, unknown> = {}) =>
      resolveDiscount({ shop, promotions: null, code: VOUCHER.code, subtotalCents: 1400, chargesCents: 0, emailLower: 'z@x.example', now, ...extra });
    expect(await v()).toMatchObject({ ok: true, offer: { kind: 'voucher', cents: 500 } });
    m.findDiscountUseRows.mockResolvedValue([{ state: 'PLACED', customerEmail: 'q@x.example' }]);
    expect(await v()).toMatchObject({ ok: false, problem: 'used_up' });
    m.findDiscountUseRows.mockResolvedValue([{ state: 'REJECTED', customerEmail: 'q@x.example' }]);
    expect(await v()).toMatchObject({ ok: true });
    expect(await v({ now: new Date('2027-01-07T22:00:00Z') })).toMatchObject({ ok: true }); // 23:00 local on the last day
    expect(await v({ now: new Date('2027-01-07T23:30:00Z') })).toMatchObject({ ok: false, problem: 'expired' });
    m.findVoucher.mockResolvedValue(null);
    expect(await v()).toMatchObject({ ok: false, problem: 'unknown' });
  });
});
