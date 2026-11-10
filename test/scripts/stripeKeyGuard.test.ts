import { describe, expect, it } from 'vitest';
import { assertTestModeStripeKey } from '../../scripts/stripeKeyGuard';

describe('assertTestModeStripeKey', () => {
  it.each(['sk_live_abc123', 'rk_live_abc123'])('refuses %s without echoing it', (key) => {
    expect(() => assertTestModeStripeKey(key)).toThrow(/LIVE Stripe key/);
    try {
      assertTestModeStripeKey(key);
    } catch (e) {
      expect((e as Error).message).not.toContain(key);
    }
  });
  it.each(['sk_test_abc', 'rk_test_abc'])('allows %s', (key) => {
    expect(assertTestModeStripeKey(key)).toBe(key);
  });
  it('refuses a missing key', () => {
    expect(() => assertTestModeStripeKey(undefined)).toThrow(/Missing/);
    expect(() => assertTestModeStripeKey('')).toThrow(/Missing/);
  });
});
