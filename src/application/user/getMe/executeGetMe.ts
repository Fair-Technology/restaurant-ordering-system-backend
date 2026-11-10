import { HttpRequest } from '@azure/functions';
import { getPrincipalFromAuth } from '../../../infrastructure/auth/authHelpers';
import { platformAccessLevel } from '../../../infrastructure/auth/principal';
import { findUserById, upsertUser } from '../../../infrastructure/cosmos/user/CosmosUserRepository';
import { ApplicationResult } from '../../_shared/types';
import { GetMeResultDto } from './dtos';

export async function executeGetMe(
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetMeResultDto>> {
  try {
    const principal = await getPrincipalFromAuth(httpRequest);
    const now = new Date().toISOString();

    // Platform operators are not app users. Their role is the app role on their
    // token, not a field in our database, so report it directly and write no
    // profile for them: they belong in Entra, not in the users container.
    //
    // This is also the answer the superadmin console gates on - it asks "who am I"
    // and believes the reply, so the role has to come from the token here rather
    // than from a stored flag that platform staff will never have.
    const platformAccess = platformAccessLevel(principal);
    if (platformAccess) {
      const existing = await findUserById(principal.userId);
      return {
        ok: true,
        data: {
          id: principal.userId,
          email: principal.email ?? existing?.email,
          name: principal.name ?? existing?.name,
          systemRole: 'superadmin',
          platformAccess,
          createdAt: existing?.createdAt ?? now,
          updatedAt: existing?.updatedAt ?? now,
        },
      };
    }

    const profile = await upsertUser({
      id: principal.userId,
      email: principal.email,
      name: principal.name,
      systemRole: 'user',
      createdAt: now,
      updatedAt: now,
    });

    return {
      ok: true,
      data: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        systemRole: profile.systemRole,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve user profile' };
  }
}
