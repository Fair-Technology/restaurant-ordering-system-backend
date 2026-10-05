import Stripe from 'stripe';

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

/** Direct charge on the restaurant's account. Money is only reserved here; it is taken on acceptance. */
export async function createPaymentIntent(
  input: CreatePaymentIntentInput,
): Promise<{ id: string; clientSecret: string | null }> {
  const intent = await getStripe().paymentIntents.create(
    {
      amount: input.amountCents,
      currency: input.currency.toLowerCase(),
      payment_method_types: ['card'],
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

export async function createRefund(input: {
  connectAccountId: string;
  paymentIntentId: string;
  amountCents: number;
  idempotencyKey: string;
}): Promise<{ id: string }> {
  const refund = await getStripe().refunds.create(
    {
      payment_intent: input.paymentIntentId,
      amount: input.amountCents,
      reason: 'requested_by_customer',
    },
    { stripeAccount: input.connectAccountId, idempotencyKey: input.idempotencyKey },
  );
  return { id: refund.id };
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
