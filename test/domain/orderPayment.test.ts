import { describe, expect, it } from 'vitest';
import {
  displayPaymentStatus,
  hasFreshCaptureClaim,
  isDueForReleaseRetry,
  needsPaymentRelease,
  paymentStatusAfterRefund,
  refundableCents,
  refundedCents,
  validateRefundAmount,
} from '../../src/domain/order/payment';
import type { Order } from '../../src/domain/order/Order';
import { REFUND_AMOUNT_ERROR } from '../../src/domain/order/orderErrors';
import { ACCEPTED_CARD_ORDER, LEGACY_CASH_ORDER } from '../fixtures/orders';

const refund = (amountCents: number) => ({ amountCents }) as NonNullable<Order['refunds']>[number];
const card = (status: string) => ({ payment: { method: 'card', status, stripePaymentIntentId: 'pi_1' } }) as Pick<Order, 'payment'>;

describe('order payment rules', () => {
  it('old pay-at-collection orders read as not paid online', () => {
    expect(displayPaymentStatus(LEGACY_CASH_ORDER)).toBe('not_paid_online');
    expect(displayPaymentStatus({ payment: { ...LEGACY_CASH_ORDER.payment, status: 'cash_collected' as never } })).toBe(
      'not_paid_online',
    );
    expect(displayPaymentStatus(card('authorized'))).toBe('authorized');
    expect(displayPaymentStatus(card('paid'))).toBe('paid');
    expect(displayPaymentStatus(card('refunded_in_cash'))).toBe('not_paid_online');
  });

  it('counts what is still refundable', () => {
    expect(refundedCents({ refunds: [refund(300), refund(200)] })).toBe(500);
    expect(refundableCents({ subtotalCents: 1050, refunds: [refund(300)] })).toBe(750);
    expect(refundableCents({ subtotalCents: 1050 })).toBe(1050);
  });

  it('validates a refund amount', () => {
    const o = { subtotalCents: 1050, refunds: [refund(300)] };
    expect(validateRefundAmount(o, 0)).toBe(REFUND_AMOUNT_ERROR);
    expect(validateRefundAmount(o, 751)).toBe(REFUND_AMOUNT_ERROR);
    expect(validateRefundAmount(o, 750)).toBeNull();
    expect(validateRefundAmount(o, 1.5)).toBe(REFUND_AMOUNT_ERROR);
    expect(validateRefundAmount(o, '5')).toBe(REFUND_AMOUNT_ERROR);
  });

  it('a declined or cancelled order releases its payment', () => {
    const o = ACCEPTED_CARD_ORDER;
    const withState = (state: Order['state'], status: string) =>
      ({ state, payment: { ...o.payment, status } }) as Pick<Order, 'state' | 'payment'>;
    expect(needsPaymentRelease(withState('REJECTED', 'authorized'))).toBe(true);
    expect(needsPaymentRelease(withState('CANCELLED', 'paid'))).toBe(true);
    expect(needsPaymentRelease(withState('REJECTED', 'canceled'))).toBe(false);
    expect(needsPaymentRelease(withState('REJECTED', 'refunded'))).toBe(false);
    expect(needsPaymentRelease(withState('ACCEPTED', 'authorized'))).toBe(false);
    expect(needsPaymentRelease({ ...LEGACY_CASH_ORDER, state: 'REJECTED' })).toBe(false);
  });

  it('retries a failed release after 15 minutes', () => {
    const o = {
      state: 'REJECTED' as const,
      payment: ACCEPTED_CARD_ORDER.payment,
      releaseFailure: { at: '2026-10-05T10:00:00.000Z', message: 'x', notifiedAt: null },
    };
    expect(isDueForReleaseRetry(o, new Date('2026-10-05T10:14:59Z'))).toBe(false);
    expect(isDueForReleaseRetry(o, new Date('2026-10-05T10:15:00Z'))).toBe(true);
    expect(isDueForReleaseRetry({ ...o, releaseFailure: undefined }, new Date('2026-10-05T10:00:00Z'))).toBe(true);
  });

  it('status after a refund', () => {
    expect(paymentStatusAfterRefund({ subtotalCents: 1050 }, 1050)).toBe('refunded');
    expect(paymentStatusAfterRefund({ subtotalCents: 1050 }, 300)).toBe('partially_refunded');
    expect(paymentStatusAfterRefund({ subtotalCents: 1050, refunds: [refund(300)] }, 750)).toBe('refunded');
  });

  it('a fresh capture claim blocks others for two minutes', () => {
    const o = { captureStartedAt: '2026-10-05T10:00:00.000Z' };
    expect(hasFreshCaptureClaim(o, new Date('2026-10-05T10:01:59Z'))).toBe(true);
    expect(hasFreshCaptureClaim(o, new Date('2026-10-05T10:02:00Z'))).toBe(false);
    expect(hasFreshCaptureClaim({}, new Date('2026-10-05T10:00:00Z'))).toBe(false);
  });

  it('the delivery fee is refundable too', () => {
    const o = { subtotalCents: 1050, totalCents: 1300, refunds: [] };
    expect(refundableCents(o)).toBe(1300);
    expect(paymentStatusAfterRefund(o, 1050)).toBe('partially_refunded');
    expect(paymentStatusAfterRefund(o, 1300)).toBe('refunded');
    expect(validateRefundAmount(o, 1300)).toBeNull();
    expect(validateRefundAmount(o, 1301)).toBe(REFUND_AMOUNT_ERROR);
    expect(refundableCents({ subtotalCents: 1050, refunds: [] })).toBe(1050);
  });
});
