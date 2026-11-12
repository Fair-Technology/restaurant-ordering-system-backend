/** True for a Stripe restricted key (`rk_test_…` / `rk_live_…`). Pure: looks at the prefix only, never logs the key. */
export function isRestrictedStripeKey(key: string | undefined | null): boolean {
  return typeof key === 'string' && key.trim().startsWith('rk_');
}
