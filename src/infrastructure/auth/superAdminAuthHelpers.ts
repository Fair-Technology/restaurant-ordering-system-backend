import { HttpRequest } from '@azure/functions';
import { authenticate, isPlatformAdmin, Principal } from './principal';
import { findUserById } from '../cosmos/user/CosmosUserRepository';

/**
 * Decides whether the caller may use the platform (superadmin) API.
 *
 * Two legitimate ways in, and they are deliberately distinct:
 *
 * 1. Platform operators — our own staff, signed in through the workforce tenant
 *    and holding the Platform.Owner or Platform.Support app role. Authorisation
 *    lives in Entra: removing the role assignment revokes access, with an audit
 *    trail, and needs no database write.
 * 2. Legacy app users — a `systemRole: 'superadmin'` flag on the users document.
 *    Kept while existing superadmins migrate to the app role, and checked only
 *    for customer-tenant tokens so a platform identity can never fall back to it.
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
  if (isPlatformAdmin(principal)) return true;
  // Platform identities never fall back to the legacy flag; customer identities still may.
  if (principal.issuer === 'customer') {
    return (await findUserById(principal.userId))?.systemRole === 'superadmin';
  }
  return false;
}
