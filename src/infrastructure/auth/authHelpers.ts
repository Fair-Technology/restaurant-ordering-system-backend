import { HttpRequest } from '@azure/functions';
import { jwtVerify, createRemoteJWKSet } from 'jose';

const tenantName = process.env.ENTRA_TENANT_NAME!;
const tenantId = process.env.ENTRA_TENANT_ID!;
const apiClientId = process.env.ENTRA_CLIENT_ID!;

// JWKS fetched once and cached by jose
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) {
    const jwksUrl = new URL(
      `https://${tenantName}.ciamlogin.com/${tenantId}/discovery/v2.0/keys`,
    );
    jwks = createRemoteJWKSet(jwksUrl);
  }
  return jwks;
}

/**
 * Verify a bearer JWT against Entra CIAM JWKS keys, validate the issuer and
 * audience, and return the identity claims it carries.
 */
export async function verifyEntraAccessToken(
  token: string,
): Promise<{ oid: string; email?: string; name?: string }> {
  // CIAM issuers use the tenant ID as the subdomain, not the tenant name.
  // Confirmed via: https://{tenantName}.ciamlogin.com/{tenantId}/v2.0/.well-known/openid-configuration
  const expectedIssuer = `https://${tenantId}.ciamlogin.com/${tenantId}/v2.0`;

  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, getJwks(), {
      issuer: expectedIssuer,
      audience: apiClientId,
    });
    payload = result.payload as Record<string, unknown>;
  } catch (err: any) {
    // jose throws typed errors (JWTExpired, JWSSignatureVerificationFailed, etc.)
    // Normalise to the single error string that all service catch blocks handle.
    console.error('[auth] jwtVerify failed:', err?.code, err?.message);
    throw new Error('Authentication required');
  }

  const oid = payload['oid'] as string | undefined;
  if (!oid) {
    throw new Error('Authentication required');
  }

  return {
    oid,
    email: payload['preferred_username'] as string | undefined,
    name: payload['name'] as string | undefined,
  };
}

/**
 * Extract user ID (oid claim) from the Bearer JWT in the Authorization header.
 * Verifies the JWT signature against Entra CIAM JWKS keys, validates the issuer,
 * and validates the audience against the registered backend API client ID.
 */
export async function getUserIdFromAuth(request: HttpRequest): Promise<string> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authentication required');
  }

  const token = authHeader.slice(7);
  const { oid } = await verifyEntraAccessToken(token);
  return oid;
}
