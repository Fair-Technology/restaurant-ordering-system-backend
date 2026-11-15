/** True for a Stripe restricted key (`rk_test_…` / `rk_live_…`). Pure: looks at the prefix only, never logs the key. */
export function isRestrictedStripeKey(key: string | undefined | null): boolean {
  return typeof key === 'string' && key.trim().startsWith('rk_');
}

export const UNRESTRICTED_LIVE_KEY_PREFIX = 'sk_live_';

/** True for the account's own unrestricted LIVE secret key (`sk_live_…`), which the platform must never use.
 *  Pure: looks at the prefix only, never logs the key. */
export function isUnrestrictedLiveStripeKey(key: string | undefined | null): boolean {
  return typeof key === 'string' && key.trim().startsWith(UNRESTRICTED_LIVE_KEY_PREFIX);
}

/** Returns the key unchanged when it is safe to use, and throws (key value never in the message) when it is an sk_live_ key. */
export function assertNotUnrestrictedLiveKey(key: string): string {
  if (isUnrestrictedLiveStripeKey(key)) {
    throw new Error(
      'Refusing to use an unrestricted live Stripe secret key (sk_live_…). The platform account must use a restricted live key (rk_live_…).',
    );
  }
  return key;
}
