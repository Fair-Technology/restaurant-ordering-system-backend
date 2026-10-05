import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  refundsCreate: vi.fn(),
  refundsList: vi.fn(),
  domainsList: vi.fn(),
  domainsCreate: vi.fn(),
  piCreate: vi.fn(),
  piCapture: vi.fn(),
  piCancel: vi.fn(),
  piRetrieve: vi.fn(),
}));

vi.mock('stripe', () => ({
  default: function () {
    return {
      refunds: { create: m.refundsCreate, list: m.refundsList },
      paymentMethodDomains: { list: m.domainsList, create: m.domainsCreate },
      paymentIntents: {
        create: m.piCreate,
        capture: m.piCapture,
        cancel: m.piCancel,
        retrieve: m.piRetrieve,
      },
    };
  },
}));

import {
  capturePaymentIntent,
  createPaymentIntent,
  createRefund,
  ensurePaymentMethodDomain,
  findLiveRefund,
  isRetryableStripeError,
  releaseAuthorization,
  storefrontDomainName,
} from '../../src/infrastructure/stripe/stripeClient';

let savedKey: string | undefined;
let savedUrl: string | undefined;

beforeEach(() => {
  savedKey = process.env.STRIPE_SECRET_KEY;
  savedUrl = process.env.STOREFRONT_BASE_URL;
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  vi.clearAllMocks();
});

afterEach(() => {
  if (savedKey === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = savedKey;
  if (savedUrl === undefined) delete process.env.STOREFRONT_BASE_URL;
  else process.env.STOREFRONT_BASE_URL = savedUrl;
});

describe('stripeClient', () => {
  it('card payments are only reserved at checkout', async () => {
    m.piCreate.mockResolvedValue({ id: 'pi_1', client_secret: 'cs_1' });
    const r = await createPaymentIntent({
      connectAccountId: 'acct_1',
      amountCents: 1400,
      currency: 'EUR',
      description: 'Ma Pasta AB3-K7P',
      orderRef: 'AB3-K7P',
      sessionId: 'sess-1',
      idempotencyKey: 'checkout-x',
    });
    expect(r).toEqual({ id: 'pi_1', clientSecret: 'cs_1' });
    expect(m.piCreate).toHaveBeenCalledWith(
      {
        amount: 1400,
        currency: 'eur',
        payment_method_types: ['card'],
        capture_method: 'manual',
        description: 'Ma Pasta AB3-K7P',
        metadata: { orderRef: 'AB3-K7P', sessionId: 'sess-1' },
      },
      { stripeAccount: 'acct_1', idempotencyKey: 'checkout-x' },
    );
  });

  it('capture and release use idempotency keys', async () => {
    m.piCapture.mockResolvedValue({});
    m.piCancel.mockResolvedValue({});
    await capturePaymentIntent({ connectAccountId: 'acct_1', paymentIntentId: 'pi_1', idempotencyKey: 'capture-o1' });
    expect(m.piCapture).toHaveBeenCalledWith('pi_1', {}, { stripeAccount: 'acct_1', idempotencyKey: 'capture-o1' });
    const r = await releaseAuthorization({
      connectAccountId: 'acct_1',
      paymentIntentId: 'pi_1',
      idempotencyKey: 'release-o1',
    });
    expect(r).toBe('canceled');
    expect(m.piCancel).toHaveBeenCalledWith('pi_1', {}, { stripeAccount: 'acct_1', idempotencyKey: 'release-o1' });
  });

  it('releasing an already captured payment reports it', async () => {
    const input = { connectAccountId: 'acct_1', paymentIntentId: 'pi_1', idempotencyKey: 'release-o1' };
    m.piCancel.mockRejectedValue(new Error('cannot cancel'));
    m.piRetrieve.mockResolvedValueOnce({ status: 'succeeded' });
    await expect(releaseAuthorization(input)).resolves.toBe('already_captured');
    m.piRetrieve.mockResolvedValueOnce({ status: 'canceled' });
    await expect(releaseAuthorization(input)).resolves.toBe('canceled');
    m.piRetrieve.mockResolvedValueOnce({ status: 'requires_capture' });
    await expect(releaseAuthorization(input)).rejects.toThrow('cannot cancel');
  });

  it("refunds on the restaurant's own Stripe account", async () => {
    m.refundsCreate.mockResolvedValue({ id: 're_1' });
    const r = await createRefund({
      connectAccountId: 'acct_1',
      paymentIntentId: 'pi_1',
      amountCents: 1050,
      idempotencyKey: 'auto-refund-o1',
    });
    expect(r).toEqual({ id: 're_1' });
    expect(m.refundsCreate).toHaveBeenCalledWith(
      { payment_intent: 'pi_1', amount: 1050, reason: 'requested_by_customer' },
      { stripeAccount: 'acct_1', idempotencyKey: 'auto-refund-o1' },
    );
  });

  it('registers the storefront domain once', async () => {
    m.domainsList.mockResolvedValueOnce({ data: [] });
    await expect(ensurePaymentMethodDomain('shop.example')).resolves.toBe('created');
    expect(m.domainsCreate).toHaveBeenCalledWith({ domain_name: 'shop.example' }, undefined);
    m.domainsCreate.mockClear();
    m.domainsList.mockResolvedValueOnce({ data: [] });
    await ensurePaymentMethodDomain('shop.example', 'acct_1');
    expect(m.domainsCreate).toHaveBeenCalledWith({ domain_name: 'shop.example' }, { stripeAccount: 'acct_1' });
    m.domainsCreate.mockClear();
    m.domainsList.mockResolvedValueOnce({ data: [{ id: 'pmd_1' }] });
    await expect(ensurePaymentMethodDomain('shop.example')).resolves.toBe('exists');
    expect(m.domainsCreate).not.toHaveBeenCalled();
  });

  it('without a secret key Stripe calls fail', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await expect(
      capturePaymentIntent({ connectAccountId: 'acct_1', paymentIntentId: 'pi_1', idempotencyKey: 'k' }),
    ).rejects.toThrow('STRIPE_SECRET_KEY is not configured');
  });

  it('a capture that failed but whose money was in fact taken counts as done', async () => {
    const input = { connectAccountId: 'acct_1', paymentIntentId: 'pi_1', idempotencyKey: 'capture-o1-2' };
    m.piCapture.mockRejectedValue(new Error('already captured'));
    m.piRetrieve.mockResolvedValue({ status: 'succeeded' });
    await expect(capturePaymentIntent(input)).resolves.toBeUndefined();
    m.piRetrieve.mockResolvedValue({ status: 'requires_capture' });
    await expect(capturePaymentIntent(input)).rejects.toThrow('already captured');
  });

  it('finds an earlier refund that did not fail', async () => {
    m.refundsList.mockResolvedValue({ data: [{ id: 're_bad', status: 'failed' }, { id: 're_ok', status: 'succeeded' }] });
    expect(await findLiveRefund({ connectAccountId: 'acct_1', paymentIntentId: 'pi_1' })).toEqual({ id: 're_ok' });
    m.refundsList.mockResolvedValue({ data: [] });
    expect(await findLiveRefund({ connectAccountId: 'acct_1', paymentIntentId: 'pi_1' })).toBeNull();
  });

  it('storefront domain comes from the storefront URL', () => {
    process.env.STOREFRONT_BASE_URL = 'https://shop.example/menu';
    expect(storefrontDomainName()).toBe('shop.example');
    process.env.STOREFRONT_BASE_URL = 'http://localhost:5175';
    expect(storefrontDomainName()).toBeNull();
    delete process.env.STOREFRONT_BASE_URL;
    expect(storefrontDomainName()).toBeNull();
  });

  it('tells passing Stripe outages from final refusals', () => {
    expect(isRetryableStripeError({ type: 'StripeConnectionError' })).toBe(true);
    expect(isRetryableStripeError({ type: 'StripeAPIError' })).toBe(true);
    expect(isRetryableStripeError({ type: 'StripeRateLimitError' })).toBe(true);
    expect(isRetryableStripeError({ type: 'StripeCardError' })).toBe(false);
    expect(isRetryableStripeError({ type: 'StripeInvalidRequestError' })).toBe(false);
  });
});
