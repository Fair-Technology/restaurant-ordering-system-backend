import { describe, expect, it } from 'vitest';
import {
  unrecordedExternalRefunds,
  withExternalRefunds,
  withStripeRefundSync,
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

describe('refund endings and reversals', () => {
  const nowIso = '2026-10-05T13:00:00.000Z';
  const R = {
    id: 'stripe-re_d1', amountCents: 300, reason: 'Stripe dashboard', at: AT,
    actor: { type: 'system' as const }, stripeRefundId: 're_d1',
  };
  const partial = {
    ...ACCEPTED_CARD_ORDER,
    payment: { ...ACCEPTED_CARD_ORDER.payment, status: 'partially_refunded' as const },
    refunds: [R],
  };

  it('a full dashboard refund of an order being prepared ends it', () => {
    const res = withExternalRefunds(ACCEPTED_CARD_ORDER, [{ stripeRefundId: 're_d1', amountCents: 1050, at: AT }], nowIso);
    expect(res.state).toBe('REFUNDED');
    expect(res.history.at(-1)).toEqual({ from: 'ACCEPTED', to: 'REFUNDED', at: nowIso, actor: { type: 'system' } });
  });

  it('a partial one leaves it active', () => {
    expect(withExternalRefunds(ACCEPTED_CARD_ORDER, [{ stripeRefundId: 're_d1', amountCents: 300, at: AT }], nowIso).state).toBe('ACCEPTED');
  });

  it('a failed refund is reversed once', () => {
    const list = [s('re_d1', 300, { status: 'failed' })];
    const res = withStripeRefundSync(partial, list, nowIso);
    expect(res.refunds?.[1]).toEqual({
      id: 'reversal-re_d1', amountCents: -300, reason: 'stripe_refund_failed', at: nowIso,
      actor: { type: 'system' }, stripeRefundId: 're_d1', reversesIndex: 0,
    });
    expect(res.payment.status).toBe('paid');
    expect(withStripeRefundSync(res, list, nowIso)).toBe(res);
  });

  it('a cancelled refund is reversed too', () => {
    const res = withStripeRefundSync(partial, [s('re_d1', 300, { status: 'canceled' })], nowIso);
    expect(res.refunds?.[1].reason).toBe('stripe_refund_canceled');
  });

  it('pending or succeeded refunds are not reversed', () => {
    expect(withStripeRefundSync(partial, [s('re_d1', 300, { status: 'pending' })], nowIso)).toBe(partial);
    expect(withStripeRefundSync(partial, [s('re_d1', 300)], nowIso)).toBe(partial);
  });

  it('a fully refunded ended order stays ended after a reversal', () => {
    const ended = {
      ...ACCEPTED_CARD_ORDER,
      state: 'REFUNDED' as const,
      payment: { ...ACCEPTED_CARD_ORDER.payment, status: 'refunded' as const },
      refunds: [{ ...R, amountCents: 1050 }],
    };
    const res = withStripeRefundSync(ended, [s('re_d1', 1050, { status: 'failed' })], nowIso);
    expect(res.state).toBe('REFUNDED');
    expect(res.payment.status).toBe('paid');
  });

  it('a dashboard refund that failed before we saw it is ignored', () => {
    expect(withStripeRefundSync(ACCEPTED_CARD_ORDER, [s('re_x', 300, { status: 'failed' })], nowIso)).toBe(ACCEPTED_CARD_ORDER);
  });
});
