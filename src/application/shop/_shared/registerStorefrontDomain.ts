import { ensurePaymentMethodDomain, storefrontDomainName } from '../../../infrastructure/stripe/stripeClient';
import { isRestrictedStripeKey } from '../../../infrastructure/stripe/restrictedKey';
import { logStripeFailure } from '../../../infrastructure/stripe/stripeErrorDiagnostics';

/**
 * Registers the storefront's web domain on a restaurant's own Stripe account so Apple Pay and
 * Google Pay can show up at checkout. Best effort: a failure here must never block onboarding,
 * because card payments work without wallets. Does nothing for a local or unset storefront address.
 */
let restrictedKeySkipLogged = false;

export async function registerStorefrontDomain(connectedAccountId: string): Promise<void> {
  const domain = storefrontDomainName();
  if (!domain) return;
  // Stripe never lets a restricted key manage payment method domains, so the call can only fail.
  if (isRestrictedStripeKey(process.env.STRIPE_SECRET_KEY)) {
    if (!restrictedKeySkipLogged) {
      restrictedKeySkipLogged = true;
      console.info(
        'Skipping wallet domain registration: STRIPE_SECRET_KEY is a restricted key, which Stripe does not allow to register payment method domains. Register wallets in the Stripe Dashboard or use a standard key.',
      );
    }
    return;
  }
  try {
    await ensurePaymentMethodDomain(domain, connectedAccountId);
  } catch (error: unknown) {
    logStripeFailure('register_payment_method_domain', error, { account: connectedAccountId });
    console.warn(
      `Could not register ${domain} for wallets on ${connectedAccountId}: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}
