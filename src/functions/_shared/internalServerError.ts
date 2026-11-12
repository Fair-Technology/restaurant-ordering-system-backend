import { HttpResponseInit } from '@azure/functions';
import { errorBrief } from '../../application/_shared/errorBrief';
import { diagnoseStripeError, formatStripeFailure } from '../../infrastructure/stripe/stripeErrorDiagnostics';

/**
 * The response for an exception that escaped a handler: the same bare 500 as before, but the cause is
 * logged first. A Stripe-shaped error also gets the greppable `[stripe:failure]` line. Never changes the response.
 */
export function internalServerError(handler: string, err: unknown): HttpResponseInit {
  console.error(`[http:500] handler=${handler} cause=${errorBrief(err)}`);
  if (diagnoseStripeError(err).type !== null) console.error(formatStripeFailure(`handler:${handler}`, err));
  return { status: 500, jsonBody: { error: 'Internal server error' } };
}
