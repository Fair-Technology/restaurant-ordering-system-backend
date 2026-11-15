import { describe, expect, it } from 'vitest';
import {
  assertNotUnrestrictedLiveKey,
  isUnrestrictedLiveStripeKey,
} from '../../../src/infrastructure/stripe/restrictedKey';

describe('isUnrestrictedLiveStripeKey', () => {
  it.each(['sk_live_abc123', '  sk_live_x  '])('flags %s', (key) => {
    expect(isUnrestrictedLiveStripeKey(key)).toBe(true);
  });
  it.each(['sk_test_abc', 'rk_test_abc', 'rk_live_abc', '', undefined, null])('does not flag %s', (key) => {
    expect(isUnrestrictedLiveStripeKey(key)).toBe(false);
  });
});

describe('assertNotUnrestrictedLiveKey', () => {
  it.each(['sk_live_abc123', 'sk_live_' + 'A'.repeat(24), '  sk_live_x  '])(
    'refuses %s without echoing it',
    (key) => {
      expect(() => assertNotUnrestrictedLiveKey(key)).toThrow(/unrestricted live Stripe secret key/);
      try {
        assertNotUnrestrictedLiveKey(key);
      } catch (e) {
        expect((e as Error).message).not.toContain(key.trim());
      }
    },
  );
  it.each(['sk_test_abc', 'rk_test_abc', 'rk_live_abc'])('allows %s unchanged', (key) => {
    expect(assertNotUnrestrictedLiveKey(key)).toBe(key);
  });
});
