import Stripe from 'stripe';
import type { StripeRefundSummary } from '../../domain/order/externalRefunds';

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(key);
}

export interface CreatePaymentIntentInput {
  connectAccountId: string;
  amountCents: number;
  currency: string;
  description: string;
  orderRef: string;
  sessionId: string; // the checkout session, which becomes the order id; the webhook finds it again by this
  idempotencyKey: string;
}

/** Payment methods diners can use. Apple Pay and Google Pay ride on 'card'.
 *  Changing this changes what the privacy notice and DPA must say. */
export const DINER_PAYMENT_METHOD_TYPES: readonly ['card'] = ['card'] as const;

/** Direct charge on the restaurant's account. Money is only reserved here; it is taken on acceptance. */
export async function createPaymentIntent(
  input: CreatePaymentIntentInput,
): Promise<{ id: string; clientSecret: string | null }> {
  const intent = await getStripe().paymentIntents.create(
    {
      amount: input.amountCents,
      currency: input.currency.toLowerCase(),
      payment_method_types: [...DINER_PAYMENT_METHOD_TYPES],
      capture_method: 'manual',
      description: input.description,
      metadata: { orderRef: input.orderRef, sessionId: input.sessionId },
    },
    { stripeAccount: input.connectAccountId, idempotencyKey: input.idempotencyKey },
  );
  return { id: intent.id, clientSecret: intent.client_secret };
}

/**
 * Takes the reserved money. If the call fails but Stripe says the payment has in fact been taken
 * (an earlier try whose answer got lost), that counts as success.
 */
export async function capturePaymentIntent(input: {
  connectAccountId: string;
  paymentIntentId: string;
  idempotencyKey: string;
}): Promise<void> {
  const stripe = getStripe();
  try {
    await stripe.paymentIntents.capture(
      input.paymentIntentId,
      {},
      { stripeAccount: input.connectAccountId, idempotencyKey: input.idempotencyKey },
    );
  } catch (err: unknown) {
    let status: string | undefined;
    try {
      status = (
        await stripe.paymentIntents.retrieve(input.paymentIntentId, { stripeAccount: input.connectAccountId })
      ).status;
    } catch {
      throw err;
    }
    if (status !== 'succeeded') throw err;
  }
}

/**
 * Releases the reserved money. If the cancel is refused because the payment is already
 * captured, says so (the caller must refund instead); an already-canceled payment counts as released.
 */
export async function releaseAuthorization(input: {
  connectAccountId: string;
  paymentIntentId: string;
  idempotencyKey: string;
}): Promise<'canceled' | 'already_captured'> {
  const stripe = getStripe();
  const options = { stripeAccount: input.connectAccountId, idempotencyKey: input.idempotencyKey };
  try {
    await stripe.paymentIntents.cancel(input.paymentIntentId, {}, options);
    return 'canceled';
  } catch (err: unknown) {
    const current = await stripe.paymentIntents.retrieve(input.paymentIntentId, {
      stripeAccount: input.connectAccountId,
    });
    if (current.status === 'succeeded') return 'already_captured';
    if (current.status === 'canceled') return 'canceled';
    throw err;
  }
}

/** Stamped on every refund our app creates, so the refund webhook can tell ours from the Stripe dashboard's. */
export const APP_REFUND_SOURCE = 'ordering-app';

export async function createRefund(input: {
  connectAccountId: string;
  paymentIntentId: string;
  orderId: string;
  amountCents: number;
  idempotencyKey: string;
}): Promise<{ id: string }> {
  const refund = await getStripe().refunds.create(
    {
      payment_intent: input.paymentIntentId,
      amount: input.amountCents,
      reason: 'requested_by_customer',
      metadata: { source: APP_REFUND_SOURCE, orderId: input.orderId },
    },
    { stripeAccount: input.connectAccountId, idempotencyKey: input.idempotencyKey },
  );
  return { id: refund.id };
}

/** Every refund on the payment, as Stripe returns them (newest first); callers sort. */
export async function listPaymentRefunds(input: {
  connectAccountId: string;
  paymentIntentId: string;
}): Promise<StripeRefundSummary[]> {
  const list = await getStripe().refunds.list(
    { payment_intent: input.paymentIntentId, limit: 100 },
    { stripeAccount: input.connectAccountId },
  );
  return list.data.map((r) => ({
    id: r.id,
    amountCents: r.amount,
    currency: r.currency,
    status: r.status ?? null,
    createdAtIso: new Date(r.created * 1000).toISOString(),
    fromApp: r.metadata?.source === APP_REFUND_SOURCE,
  }));
}

/** The first refund on the payment that has not failed or been cancelled, or null when none was made. */
export async function findLiveRefund(input: {
  connectAccountId: string;
  paymentIntentId: string;
}): Promise<{ id: string } | null> {
  const list = await getStripe().refunds.list(
    { payment_intent: input.paymentIntentId, limit: 10 },
    { stripeAccount: input.connectAccountId },
  );
  const live = list.data.find((r) => r.status !== 'failed' && r.status !== 'canceled');
  return live ? { id: live.id } : null;
}

/**
 * Apple Pay / Google Pay style wallets need the storefront domain registered with Stripe once.
 * With a connected account id the domain is registered on that restaurant's account.
 */
export async function ensurePaymentMethodDomain(
  domainName: string,
  connectedAccountId?: string,
): Promise<'created' | 'exists'> {
  const stripe = getStripe();
  const options = connectedAccountId ? { stripeAccount: connectedAccountId } : undefined;
  const existing = await stripe.paymentMethodDomains.list({ domain_name: domainName, limit: 1 }, options);
  if (existing.data.length > 0) return 'exists';
  await stripe.paymentMethodDomains.create({ domain_name: domainName }, options);
  return 'created';
}

/** Host of the public storefront, or null when it is unset or local (nothing to register). */
export function storefrontDomainName(): string | null {
  const raw = process.env.STOREFRONT_BASE_URL;
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' ? null : host;
  } catch {
    return null;
  }
}

function errorType(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null ? (err as { type?: string }).type : undefined;
}

export function isStripeIdempotencyError(err: unknown): boolean {
  return errorType(err) === 'StripeIdempotencyError';
}

/** Passing outages (network, Stripe 5xx, rate limit) are worth retrying; card and request errors are final. */
export function isRetryableStripeError(err: unknown): boolean {
  const type = errorType(err);
  return type === 'StripeConnectionError' || type === 'StripeAPIError' || type === 'StripeRateLimitError';
}

export interface PaymentIntentSnapshot {
  id: string;
  status: Stripe.PaymentIntent.Status;
  amountCents: number;
  currency: string;              // lower-case, as Stripe returns it
  sessionId: string | null;      // metadata.sessionId, null when absent
  authorizedAtMs: number | null; // latest_charge.created * 1000 when expanded to an object, else null
}

/** Reads a payment on the restaurant's account, for checking whether a checkout was really paid. */
export async function retrievePaymentIntentSnapshot(input: { connectAccountId: string; paymentIntentId: string }): Promise<PaymentIntentSnapshot> {
  const pi = await getStripe().paymentIntents.retrieve(input.paymentIntentId, { expand: ['latest_charge'] }, { stripeAccount: input.connectAccountId });
  const charge = pi.latest_charge;
  return {
    id: pi.id, status: pi.status, amountCents: pi.amount, currency: pi.currency,
    sessionId: pi.metadata?.sessionId ?? null,
    authorizedAtMs: charge && typeof charge !== 'string' ? charge.created * 1000 : null,
  };
}
