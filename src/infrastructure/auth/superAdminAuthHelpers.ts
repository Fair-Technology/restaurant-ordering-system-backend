import { HttpRequest } from '@azure/functions';
import {
  authenticate,
  isPlatformAdmin,
  platformAccessLevel,
  PlatformAccessLevel,
  Principal,
} from './principal';
import { logAuthFailure } from './logAuthFailure';

/**
 * Decides whether the caller may use the platform (superadmin) API at the given level.
 *
 * There is exactly one way in: a platform operator - our own staff, signed in
 * through the workforce tenant and holding a platform app role. Authorisation lives
 * in Entra: removing the role assignment revokes access, with an audit trail, and
 * needs no database write.
 *
 * - 'write': Platform.Owner or Platform.Support. Use for anything that changes state.
 * - 'read':  additionally Platform.ReadOnly. Use ONLY for handlers that change nothing.
 *
 * The legacy `systemRole: 'superadmin'` flag on the users document was removed on
 * 2026-11-10: a customer-tenant token can no longer reach the platform API by any means.
 *
 * Returns the userId string when allowed, null otherwise. Never throws.
 */
export async function requirePlatform(
  request: HttpRequest,
  level: PlatformAccessLevel,
): Promise<string | null> {
  try {
    const principal = await authenticate(request);
    if (principal.kind !== 'entra') return null;
    const granted = platformAccessLevel(principal);
    if (granted === 'write' || (granted === 'read' && level === 'read')) return principal.userId;
    return null;
  } catch (err) {
    logAuthFailure('requirePlatform', err);
    return null;
  }
}

/** Write-level gate (Owner/Support). Kept as the safe default; prefer `requirePlatform`. */
export function verifySuperAdminToken(request: HttpRequest): Promise<string | null> {
  return requirePlatform(request, 'write');
}

/**
 * The write-level decision, for callers that have already verified the identity and
 * need the answer as a boolean rather than as an actor id - typically endpoints
 * that are open to everyone but behave differently for platform staff.
 */
export async function isSuperAdminPrincipal(principal: Principal): Promise<boolean> {
  if (principal.kind !== 'entra') return false;
  return isPlatformAdmin(principal);
}
