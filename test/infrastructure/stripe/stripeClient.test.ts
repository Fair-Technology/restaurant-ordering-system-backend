import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Stripe from 'stripe';
import { createStripeClient } from '../../../src/infrastructure/stripe/stripeClient';

let savedKey: string | undefined;
beforeEach(() => {
  savedKey = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
});
afterEach(() => {
  if (savedKey === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = savedKey;
});

describe('createStripeClient', () => {
  it('refuses a missing key', () => {
    expect(() => createStripeClient()).toThrow(/not configured/);
  });

  it('refuses an unrestricted live key without echoing it', () => {
    const key = 'sk_live_abc123';
    expect(() => createStripeClient(key)).toThrow(/unrestricted live/);
    try {
      createStripeClient(key);
    } catch (e) {
      expect((e as Error).message).not.toContain(key);
    }
  });

  it.each(['sk_test_abc', 'rk_live_abc'])('builds a client for %s', (key) => {
    expect(createStripeClient(key)).toBeInstanceOf(Stripe);
  });

  it('reads STRIPE_SECRET_KEY when no key is given', () => {
    process.env.STRIPE_SECRET_KEY = 'rk_live_from_env';
    expect(createStripeClient()).toBeInstanceOf(Stripe);
    process.env.STRIPE_SECRET_KEY = 'sk_live_from_env';
    expect(() => createStripeClient()).toThrow(/unrestricted live/);
  });
});
