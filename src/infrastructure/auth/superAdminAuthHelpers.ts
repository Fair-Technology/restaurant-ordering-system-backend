import { HttpRequest } from '@azure/functions';
import { authenticate, isPlatformAdmin } from './principal';
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

    if (principal.kind === 'entra' && isPlatformAdmin(principal)) {
      return principal.userId;
    }

    if (principal.kind === 'entra' && principal.issuer === 'customer') {
      const profile = await findUserById(principal.userId);
      if (profile?.systemRole === 'superadmin') {
        return principal.userId;
      }
    }

    return null;
  } catch {
    return null;
  }
}
