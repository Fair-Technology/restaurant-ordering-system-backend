import { HttpRequest } from '@azure/functions';
import { authenticate, isPlatformAdmin, Principal } from './principal';

/**
 * Decides whether the caller may use the platform (superadmin) API.
 *
 * There is exactly one way in: a platform operator — our own staff, signed in
 * through the workforce tenant and holding the Platform.Owner or Platform.Support
 * app role. Authorisation lives in Entra: removing the role assignment revokes
 * access, with an audit trail, and needs no database write.
 *
 * The legacy `systemRole: 'superadmin'` flag on the users document was removed on
 * 2026-11-10, once the one row carrying it was deleted: a customer-tenant token can
 * no longer reach the platform API by any means.
 *
 * Returns the userId string when allowed, null otherwise. Never throws.
 */
export async function verifySuperAdminToken(request: HttpRequest): Promise<string | null> {
  try {
    const principal = await authenticate(request);
    if (principal.kind !== 'entra') return null;
    return (await isSuperAdminPrincipal(principal)) ? principal.userId : null;
  } catch {
    return null;
  }
}

/**
 * The same decision, for callers that have already verified the identity and
 * need the answer as a boolean rather than as an actor id - typically endpoints
 * that are open to everyone but behave differently for platform staff.
 */
export async function isSuperAdminPrincipal(principal: Principal): Promise<boolean> {
  if (principal.kind !== 'entra') return false;
  return isPlatformAdmin(principal);
}
