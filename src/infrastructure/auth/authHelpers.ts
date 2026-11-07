import { HttpRequest } from '@azure/functions';
import { verifyEntraToken, VerifiedEntraToken } from './trustedIssuers';

/**
 * Verify a bearer JWT against the trusted issuers (the customer CIAM tenant and,
 * where configured, the workforce tenant our platform operators sign in through),
 * validating signature, issuer, audience and expiry.
 */
export async function verifyEntraAccessToken(token: string): Promise<VerifiedEntraToken> {
  return verifyEntraToken(token);
}

/**
 * The full verified identity behind the Authorization header: who they are, which
 * tenant issued the token, and any app roles it carries. Use this when an
 * endpoint's authorisation depends on the issuer or on roles.
 */
export async function getPrincipalFromAuth(request: HttpRequest): Promise<VerifiedEntraToken> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authentication required');
  }

  return verifyEntraToken(authHeader.slice(7));
}

/**
 * Extract user ID (oid claim) from the Bearer JWT in the Authorization header.
 */
export async function getUserIdFromAuth(request: HttpRequest): Promise<string> {
  const { oid } = await getPrincipalFromAuth(request);
  return oid;
}
