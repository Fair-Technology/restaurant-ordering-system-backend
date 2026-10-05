import { ensurePaymentMethodDomain, storefrontDomainName } from '../../../infrastructure/stripe/stripeClient';

/**
 * Registers the storefront's web domain on a restaurant's own Stripe account so Apple Pay and
 * Google Pay can show up at checkout. Best effort: a failure here must never block onboarding,
 * because card payments work without wallets. Does nothing for a local or unset storefront address.
 */
export async function registerStorefrontDomain(connectedAccountId: string): Promise<void> {
  const domain = storefrontDomainName();
  if (!domain) return;
  try {
    await ensurePaymentMethodDomain(domain, connectedAccountId);
  } catch (error: unknown) {
    console.warn(
      `Could not register ${domain} for wallets on ${connectedAccountId}: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}
