import { diagnoseStripeError, formatStripeFailure } from '../../infrastructure/stripe/stripeErrorDiagnostics';
import { errorBrief } from './errorBrief';

/**
 * Diagnostic only. Services that catch everything and return a generic INTERNAL_ERROR call this first, so the
 * cause survives in the logs even though the response (correctly) hides it. A Stripe-shaped error also gets
 * the greppable `[stripe:failure]` line. Never changes the result the caller returns.
 */
export function logServiceFailure(site: string, err: unknown): void {
  console.error(`[service:failure] site=${site} cause=${errorBrief(err)}`);
  if (diagnoseStripeError(err).type !== null) console.error(formatStripeFailure(site, err));
}
