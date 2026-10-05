import type { DisplayPaymentStatus, Order, PaymentStatus, StoredOrderState } from './Order';
import { REFUND_AMOUNT_ERROR } from './orderErrors';

/** States in which staff may refund money that was already taken. */
export const MANUAL_REFUND_STATES: readonly StoredOrderState[] = ['ACCEPTED', 'READY', 'COMPLETED'];
export const RELEASE_RETRY_MINUTES = 15;
export const CAPTURE_CLAIM_MINUTES = 2;

const KNOWN_STATUSES: readonly PaymentStatus[] = ['authorized', 'paid', 'partially_refunded', 'refunded', 'canceled'];
const CAPTURED_STATUSES: readonly DisplayPaymentStatus[] = ['paid', 'partially_refunded', 'refunded'];

/** Old pay-in-person orders (and any stored value the code does not know) read as 'not_paid_online'. */
export function displayPaymentStatus(o: Pick<Order, 'payment'>): DisplayPaymentStatus {
  const { method, status } = o.payment;
  return method === 'card' && KNOWN_STATUSES.includes(status) ? status : 'not_paid_online';
}

/** The money has been taken from the diner's card. */
export function isCaptured(o: Pick<Order, 'payment'>): boolean {
  return CAPTURED_STATUSES.includes(displayPaymentStatus(o));
}

export function refundedCents(o: Pick<Order, 'refunds'>): number {
  return (o.refunds ?? []).reduce((sum, r) => sum + r.amountCents, 0);
}

export function refundableCents(o: Pick<Order, 'subtotalCents' | 'refunds'>): number {
  return Math.max(0, o.subtotalCents - refundedCents(o));
}

/** `amountCents` is the refund about to be added; `o.refunds` are the earlier ones. */
export function paymentStatusAfterRefund(
  o: Pick<Order, 'subtotalCents' | 'refunds'>,
  amountCents: number,
): 'partially_refunded' | 'refunded' {
  return refundedCents(o) + amountCents >= o.subtotalCents ? 'refunded' : 'partially_refunded';
}

/** null when the amount is a whole number of cents from 1 up to what is still refundable. */
export function validateRefundAmount(
  o: Pick<Order, 'subtotalCents' | 'refunds'>,
  amountCents: unknown,
): string | null {
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents)) return REFUND_AMOUNT_ERROR;
  if (amountCents < 1 || amountCents > refundableCents(o)) return REFUND_AMOUNT_ERROR;
  return null;
}

/** A declined or cancelled order whose card reservation (or money) is still with us. */
export function needsPaymentRelease(o: Pick<Order, 'state' | 'payment'>): boolean {
  if (o.state !== 'REJECTED' && o.state !== 'CANCELLED') return false;
  const status = displayPaymentStatus(o);
  return (status === 'authorized' || status === 'paid') && !!o.payment.stripePaymentIntentId;
}

export function isDueForReleaseRetry(
  o: Pick<Order, 'state' | 'payment' | 'releaseFailure'>,
  now: Date,
): boolean {
  if (!needsPaymentRelease(o)) return false;
  if (!o.releaseFailure) return true;
  return now.getTime() - new Date(o.releaseFailure.at).getTime() >= RELEASE_RETRY_MINUTES * 60_000;
}

/** An accept is taking the money right now; cancel, decline and a second accept must wait. */
export function hasFreshCaptureClaim(o: Pick<Order, 'captureStartedAt'>, now: Date): boolean {
  if (!o.captureStartedAt) return false;
  return now.getTime() - new Date(o.captureStartedAt).getTime() < CAPTURE_CLAIM_MINUTES * 60_000;
}

export function wasAutoAccepted(o: Pick<Order, 'history'>): boolean {
  return o.history.some((h) => h.to === 'ACCEPTED' && h.actor.type === 'system');
}
