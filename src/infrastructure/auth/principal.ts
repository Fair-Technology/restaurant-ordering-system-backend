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

/** An identity verified from an Entra token (as opposed to a shop staff token). */
export type EntraPrincipal = Extract<Principal, { kind: 'entra' }>;

/** App roles defined on the platform API registration (restaurant-ordering-api-workforce). */
export const PLATFORM_OWNER_ROLE = 'Platform.Owner';
export const PLATFORM_SUPPORT_ROLE = 'Platform.Support';
export const PLATFORM_READONLY_ROLE = 'Platform.ReadOnly';

/** What a platform operator may do: 'write' implies 'read'. */
export type PlatformAccessLevel = 'read' | 'write';

/**
 * The most a principal may do on the platform API, or null for none.
 *
 * Two conditions, both required: the token must come from the workforce tenant
 * (so a customer-store token can never claim platform access by adding a role),
 * and it must carry a platform role, which is only ever assigned by an
 * administrator through Entra.
 *
 * Owner/Support -> 'write'. ReadOnly -> 'read'. Anything else -> null.
 * A principal holding both gets the higher level.
 */
export function platformAccessLevel(principal: Principal): PlatformAccessLevel | null {
  if (principal.kind !== 'entra' || principal.issuer !== 'platform') return null;
  const roles = principal.roles ?? [];
  if (roles.includes(PLATFORM_OWNER_ROLE) || roles.includes(PLATFORM_SUPPORT_ROLE)) return 'write';
  if (roles.includes(PLATFORM_READONLY_ROLE)) return 'read';
  return null;
}

/**
 * Is this principal a platform operator allowed to CHANGE things (Owner/Support)?
 *
 * Platform.ReadOnly does NOT pass: this is the write-level check, and the default for
 * every caller that has not explicitly opted in to read-level access via
 * `platformAccessLevel` / `requirePlatform(request, 'read')`.
 */
export function isPlatformAdmin(principal: Principal): boolean {
  return platformAccessLevel(principal) === 'write';
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
