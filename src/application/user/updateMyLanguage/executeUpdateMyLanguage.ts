import { HttpRequest } from '@azure/functions';
import { getPrincipalFromAuth } from '../../../infrastructure/auth/authHelpers';
import { platformAccessLevel } from '../../../infrastructure/auth/principal';
import { findUserById, upsertUser } from '../../../infrastructure/cosmos/user/CosmosUserRepository';
import { isSupportedLanguage } from '../../../domain/reference/ReferenceLists';
import { ApplicationResult } from '../../_shared/types';
import { UpdateMyLanguageRequestDto, UpdateMyLanguageResultDto } from './dtos';
import { logServiceFailure } from '../../_shared/logServiceFailure';

export async function executeUpdateMyLanguage(
  request: UpdateMyLanguageRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<UpdateMyLanguageResultDto>> {
  try {
    const principal = await getPrincipalFromAuth(httpRequest);

    // Platform operators are not app users (same rule getMe applies).
    if (platformAccessLevel(principal)) {
      return {
        ok: false,
        code: 'FORBIDDEN',
        error: 'Platform operators do not have a stored interface language',
      };
    }

    if (!isSupportedLanguage(request.language)) {
      return { ok: false, code: 'INVALID_INPUT', error: 'language must be one of: de, en' };
    }

    const existing = await findUserById(principal.userId);
    const now = new Date().toISOString();
    const profile = await upsertUser({
      id: principal.userId,
      email: principal.email ?? existing?.email,
      name: principal.name ?? existing?.name,
      language: request.language,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    return {
      ok: true,
      data: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        language: profile.language,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('updateMyLanguage', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update interface language' };
  }
}
