import { describe, expect, it } from 'vitest';
import {
  unrecordedExternalRefunds,
  withExternalRefunds,
  type StripeRefundSummary,
} from '../../src/domain/order/externalRefunds';
import { ACCEPTED_CARD_ORDER } from '../fixtures/orders';

const AT = '2026-10-05T12:00:00.000Z';
const s = (id: string, amountCents: number, extra: Partial<StripeRefundSummary> = {}): StripeRefundSummary => ({
  id,
  amountCents,
  currency: 'eur',
  status: 'succeeded',
  createdAtIso: AT,
  fromApp: false,
  ...extra,
});

describe('externalRefunds', () => {
  it('picks a dashboard refund the order does not know', () => {
    expect(unrecordedExternalRefunds(ACCEPTED_CARD_ORDER, [s('re_d1', 300)])).toEqual([
      { stripeRefundId: 're_d1', amountCents: 300, at: AT },
    ]);
  });

  it('skips refunds the order already records', () => {
    const order = {
      ...ACCEPTED_CARD_ORDER,
      refunds: [
        { id: 'r1', amountCents: 300, reason: 'x', at: '2026-10-05T11:00:00.000Z', actor: { type: 'staff' as const, id: 'm1' }, stripeRefundId: 're_a' },
      ],
    };
    expect(unrecordedExternalRefunds(order, [s('re_a', 300)])).toEqual([]);
  });

  it('skips refunds our own app made, even before they are recorded', () => {
    expect(unrecordedExternalRefunds(ACCEPTED_CARD_ORDER, [s('re_app', 300, { fromApp: true })])).toEqual([]);
  });

  it('skips failed and cancelled refunds, keeps pending', () => {
    expect(
      unrecordedExternalRefunds(ACCEPTED_CARD_ORDER, [
        s('re_f', 100, { status: 'failed' }),
        s('re_c', 100, { status: 'canceled' }),
        s('re_p', 200, { status: 'pending' }),
      ]),
    ).toEqual([{ stripeRefundId: 're_p', amountCents: 200, at: AT }]);
  });

  it('skips a refund in another currency', () => {
    expect(unrecordedExternalRefunds(ACCEPTED_CARD_ORDER, [s('re_u', 300, { currency: 'usd' })])).toEqual([]);
  });

  it('oldest first, whatever order Stripe lists them in', () => {
    const out = unrecordedExternalRefunds(ACCEPTED_CARD_ORDER, [
      s('re_2', 750, { createdAtIso: '2026-10-05T13:00:00.000Z' }),
      s('re_1', 300),
    ]);
    expect(out.map((r) => r.stripeRefundId)).toEqual(['re_1', 're_2']);
  });

  const first = { stripeRefundId: 're_d1', amountCents: 300, at: AT };
  const second = { stripeRefundId: 're_d2', amountCents: 750, at: '2026-10-05T13:00:00.000Z' };

  it('a partial dashboard refund is recorded as a free amount and marks the order partly refunded', () => {
    const out = withExternalRefunds(ACCEPTED_CARD_ORDER, [first], '2026-10-05T12:01:00.000Z');
    expect(out.payment.status).toBe('partially_refunded');
    expect(out.refunds).toEqual([
      { id: 'stripe-re_d1', amountCents: 300, reason: 'Stripe dashboard', at: AT, actor: { type: 'system' }, stripeRefundId: 're_d1' },
    ]);
    expect(out.updatedAt).toBe('2026-10-05T12:01:00.000Z');
  });

  it('the rest refunded later makes it fully refunded', () => {
    const partial = withExternalRefunds(ACCEPTED_CARD_ORDER, [first], '2026-10-05T12:01:00.000Z');
    const out = withExternalRefunds(partial, [second], '2026-10-05T13:01:00.000Z');
    expect(out.payment.status).toBe('refunded');
    expect(out.refunds!.map((r) => r.id)).toEqual(['stripe-re_d1', 'stripe-re_d2']);
  });

  it('two refunds at once are both recorded in order', () => {
    const out = withExternalRefunds(ACCEPTED_CARD_ORDER, [first, second], '2026-10-05T13:01:00.000Z');
    expect(out.payment.status).toBe('refunded');
    expect(out.refunds!.map((r) => r.id)).toEqual(['stripe-re_d1', 'stripe-re_d2']);
  });

  it('a refund already on the order is not added again', () => {
    const order = withExternalRefunds(ACCEPTED_CARD_ORDER, [first], '2026-10-05T12:01:00.000Z');
    expect(withExternalRefunds(order, [first], '2026-10-05T12:02:00.000Z')).toBe(order);
  });
});
