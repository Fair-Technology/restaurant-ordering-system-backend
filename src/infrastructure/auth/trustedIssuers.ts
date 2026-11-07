import { jwtVerify, createRemoteJWKSet } from 'jose';

export type IssuerKind = 'customer' | 'platform';

export interface TrustedIssuer {
  kind: IssuerKind;
  issuer: string;
  jwksUrl: string;
  audience: string;
}

/**
 * The token issuers this API accepts.
 *
 * customer - the CIAM (Entra External ID) tenant that signs in restaurant owners
 *   and their staff. Configuration: ENTRA_TENANT_NAME / ENTRA_TENANT_ID / ENTRA_CLIENT_ID.
 * platform - the workforce tenant that signs in our own platform operators.
 *   Configuration: WORKFORCE_TENANT_ID / WORKFORCE_API_CLIENT_ID.
 *
 * The platform issuer is optional: an environment that has not been given
 * workforce settings simply accepts customer tokens only, which keeps existing
 * environments and tests working unchanged.
 */
export function trustedIssuers(): TrustedIssuer[] {
  const issuers: TrustedIssuer[] = [];

  const ciamTenantId = process.env.ENTRA_TENANT_ID;
  const ciamTenantName = process.env.ENTRA_TENANT_NAME;
  const ciamAudience = process.env.ENTRA_CLIENT_ID;
  if (ciamTenantId && ciamTenantName && ciamAudience) {
    issuers.push({
      kind: 'customer',
      // CIAM issuers use the tenant ID as the subdomain, not the tenant name.
      issuer: `https://${ciamTenantId}.ciamlogin.com/${ciamTenantId}/v2.0`,
      jwksUrl: `https://${ciamTenantName}.ciamlogin.com/${ciamTenantId}/discovery/v2.0/keys`,
      audience: ciamAudience,
    });
  }

  const workforceTenantId = process.env.WORKFORCE_TENANT_ID;
  const workforceAudience = process.env.WORKFORCE_API_CLIENT_ID;
  if (workforceTenantId && workforceAudience) {
    issuers.push({
      kind: 'platform',
      issuer: `https://login.microsoftonline.com/${workforceTenantId}/v2.0`,
      jwksUrl: `https://login.microsoftonline.com/${workforceTenantId}/discovery/v2.0/keys`,
      audience: workforceAudience,
    });
  }

  return issuers;
}

// jose caches the key set per URL, so one entry per issuer is enough.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function jwksFor(url: string) {
  const cached = jwksCache.get(url);
  if (cached) return cached;
  const keySet = createRemoteJWKSet(new URL(url));
  jwksCache.set(url, keySet);
  return keySet;
}

export interface VerifiedEntraToken {
  oid: string;
  email?: string;
  name?: string;
  issuer: IssuerKind;
  roles: string[];
}

/**
 * Verify a bearer JWT against each trusted issuer in turn. A token is accepted
 * only if some issuer's signature, issuer claim, audience and expiry all check
 * out; the returned `issuer` says which one it was, so callers can reason about
 * *where* an identity comes from rather than just who it is.
 *
 * Throws the single error string every service catch block already handles.
 */
export async function verifyEntraToken(token: string): Promise<VerifiedEntraToken> {
  const candidates = trustedIssuers();
  let lastError: any = undefined;

  for (const candidate of candidates) {
    try {
      const { payload } = await jwtVerify(token, jwksFor(candidate.jwksUrl), {
        issuer: candidate.issuer,
        audience: candidate.audience,
      });
      const claims = payload as Record<string, unknown>;
      const oid = claims['oid'] as string | undefined;
      if (!oid) throw new Error('token carries no oid claim');

      const roles = Array.isArray(claims['roles']) ? (claims['roles'] as string[]) : [];
      return {
        oid,
        email: claims['preferred_username'] as string | undefined,
        name: claims['name'] as string | undefined,
        issuer: candidate.kind,
        roles,
      };
    } catch (err: any) {
      // Try the next issuer. Only the final failure is reported, otherwise a
      // token from the workforce tenant would log a misleading CIAM error.
      lastError = err;
    }
  }

  console.error('[auth] no trusted issuer accepted the token:', lastError?.code, lastError?.message);
  throw new Error('Authentication required');
}
