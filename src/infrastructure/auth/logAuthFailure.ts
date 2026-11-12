import { errorBrief } from '../../application/_shared/errorBrief';

/** The one message authenticate() throws for an ordinary bad/missing/expired credential. */
const EXPECTED_AUTH_MESSAGE = 'Authentication required';

/**
 * Diagnostic only; never changes an outcome. Callers that turn ANY authentication error into a 403/null
 * call this first, so a missing secret or unreachable key set (which would otherwise look like every
 * user being logged out) leaves a cause in the logs. An ordinary bad credential is expected and stays quiet.
 */
export function logAuthFailure(site: string, err: unknown): void {
  const message = typeof err === 'object' && err !== null ? (err as { message?: unknown }).message : undefined;
  if (message === EXPECTED_AUTH_MESSAGE) return;
  console.error(`[auth:failure] site=${site} cause=${errorBrief(err)}`);
}
