import { HttpRequest } from '@azure/functions';
import { authenticate } from '../../../infrastructure/auth/principal';
import { findStaffAccountById } from '../../../infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { toDto } from '../_shared';
import { GetStaffMeResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { logServiceFailure } from '../../_shared/logServiceFailure';

export async function executeGetStaffMe(
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetStaffMeResultDto>> {
  try {
    const principal = await authenticate(httpRequest);
    if (principal.kind !== 'staff') {
      return { ok: false, code: 'FORBIDDEN', error: 'This endpoint is for a staff login' };
    }
    const acc = await findStaffAccountById(principal.shopId, principal.staffId);
    if (!acc || acc.isDeleted) {
      return { ok: false, code: 'NOT_FOUND', error: 'Staff login not found' };
    }
    const now = new Date();
    return { ok: true, data: { ...toDto(acc, now), shopId: acc.shopId } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('getStaffMe', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve staff profile' };
  }
}
