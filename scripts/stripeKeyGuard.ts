// Refuses to let a Stripe script run with a LIVE key. Any script under scripts/ that talks to Stripe
// must pass the key it would use through assertTestModeStripeKey before making a call.
// Mirrors the guard in copyshop's cs-api/seed/seed-stripe-prices.mjs. The message never contains the key.

export const LIVE_STRIPE_KEY_PREFIXES: readonly string[] = ['sk_live_', 'rk_live_'];

export function assertTestModeStripeKey(key: string | undefined): string {
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY');
  if (LIVE_STRIPE_KEY_PREFIXES.some((p) => key.startsWith(p))) {
    throw new Error('Refusing to run against a LIVE Stripe key - this script is test-mode only');
  }
  return key;
}
