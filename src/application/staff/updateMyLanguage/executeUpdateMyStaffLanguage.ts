import { HttpRequest } from '@azure/functions';
import { authenticate } from '../../../infrastructure/auth/principal';
import {
  findStaffAccountById,
  replaceStaffAccount,
} from '../../../infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { isSupportedLanguage } from '../../../domain/reference/ReferenceLists';
import { toDto } from '../_shared';
import { UpdateMyStaffLanguageRequestDto, UpdateMyStaffLanguageResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { logServiceFailure } from '../../_shared/logServiceFailure';

export async function executeUpdateMyStaffLanguage(
  request: UpdateMyStaffLanguageRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<UpdateMyStaffLanguageResultDto>> {
  try {
    const principal = await authenticate(httpRequest);
    if (principal.kind !== 'staff') {
      return { ok: false, code: 'FORBIDDEN', error: 'This endpoint is for a staff login' };
    }
    const acc = await findStaffAccountById(principal.shopId, principal.staffId);
    if (!acc || acc.isDeleted) {
      return { ok: false, code: 'NOT_FOUND', error: 'Staff login not found' };
    }
    if (!isSupportedLanguage(request.language)) {
      return { ok: false, code: 'INVALID_INPUT', error: 'language must be one of: de, en' };
    }
    const now = new Date();
    const saved = await replaceStaffAccount({
      ...acc,
      language: request.language,
      updatedAt: now.toISOString(),
    });
    return { ok: true, data: { ...toDto(saved, now), shopId: saved.shopId } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('updateMyStaffLanguage', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update interface language' };
  }
}
