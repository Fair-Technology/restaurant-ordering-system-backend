import { describe, expect, it } from 'vitest';
import { isRestrictedStripeKey } from '../../src/infrastructure/stripe/restrictedKey';

describe('isRestrictedStripeKey', () => {
  it('recognises restricted keys', () => {
    expect(isRestrictedStripeKey('rk_test_abc')).toBe(true);
    expect(isRestrictedStripeKey('rk_live_abc')).toBe(true);
    expect(isRestrictedStripeKey('  rk_test_abc')).toBe(true);
  });
  it('rejects standard secret keys and missing values', () => {
    expect(isRestrictedStripeKey('sk_test_abc')).toBe(false);
    expect(isRestrictedStripeKey('sk_live_abc')).toBe(false);
    expect(isRestrictedStripeKey('')).toBe(false);
    expect(isRestrictedStripeKey(undefined)).toBe(false);
    expect(isRestrictedStripeKey(null)).toBe(false);
  });
});
