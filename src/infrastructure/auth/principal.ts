import { HttpRequest } from '@azure/functions';
import { decodeProtectedHeader } from 'jose';
import { verifyEntraAccessToken } from './authHelpers';
import { verifyStaffToken } from './staffTokens';
import { StaffRole } from '../../domain/staff/StaffAccount';
import { IssuerKind } from './trustedIssuers';

export type Principal =
  | {
      kind: 'entra';
      userId: string;
      email?: string;
      name?: string;
      /** Which tenant vouched for this identity: a product customer store, or our workforce. */
      issuer: IssuerKind;
      /** App roles carried by the token. Only the platform issuer is expected to have any. */
      roles: string[];
    }
  | { kind: 'staff'; staffId: string; shopId: string; role: StaffRole };

/** App roles defined on the platform API registration (restaurant-ordering-api-workforce). */
export const PLATFORM_OWNER_ROLE = 'Platform.Owner';
export const PLATFORM_SUPPORT_ROLE = 'Platform.Support';
export const PLATFORM_READONLY_ROLE = 'Platform.ReadOnly';

/**
 * Is this principal one of our own platform operators?
 *
 * Two conditions, both required: the token must come from the workforce tenant
 * (so a customer-store token can never claim platform access by adding a role),
 * and it must carry an owner/support role, which is only ever assigned by an
 * administrator through Entra.
 *
 * Platform.ReadOnly deliberately does NOT pass: the console has no per-endpoint
 * read/write split yet, so anything short of Owner/Support is denied rather than
 * silently handed full access.
 */
export function isPlatformAdmin(principal: Principal): boolean {
  if (principal.kind !== 'entra' || principal.issuer !== 'platform') return false;
  const roles = principal.roles ?? [];
  return roles.includes(PLATFORM_OWNER_ROLE) || roles.includes(PLATFORM_SUPPORT_ROLE);
}

export async function authenticate(request: HttpRequest): Promise<Principal> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authentication required');
  }

  const token = authHeader.slice(7);

  // Staff tokens are HS256 (a shared secret); Entra tokens are RS256 (JWKS).
  // The algorithm in the unverified header is enough to route to the right
  // verifier — each verifier still independently checks signature, issuer,
  // audience and expiry before trusting anything in the payload.
  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    throw new Error('Authentication required');
  }

  if (alg === 'HS256') {
    const claims = await verifyStaffToken(token);
    return { kind: 'staff', staffId: claims.staffId, shopId: claims.shopId, role: claims.role };
  }

  const { oid, email, name, issuer, roles } = await verifyEntraAccessToken(token);
  return { kind: 'entra', userId: oid, email, name, issuer, roles };
}
