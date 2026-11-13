import { HttpRequest } from '@azure/functions';
import { patchUserLimits } from '../../../infrastructure/cosmos/user/CosmosUserRepository';
import { ApplicationResult } from '../../_shared/types';
import { UpdateUserLimitsRequestDto, UpdateUserLimitsResultDto } from './dtos';
import { verifySuperAdminToken } from '../../../infrastructure/auth/superAdminAuthHelpers';
import { logServiceFailure } from '../../_shared/logServiceFailure';

export async function executeUpdateUserLimits(
  targetUserId: string,
  request: UpdateUserLimitsRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<UpdateUserLimitsResultDto>> {
  if (request.maxShops !== null && typeof request.maxShops !== 'number') {
    return { ok: false, code: 'INVALID_INPUT', error: 'maxShops must be a number or null' };
  }
  if (
    request.maxShops !== null &&
    (!Number.isInteger(request.maxShops) || request.maxShops < -1)
  ) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'maxShops must be an integer >= -1 (use -1 for unlimited, null to use global default)',
    };
  }

  try {
    const adminId = await verifySuperAdminToken(httpRequest);
    if (!adminId) {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }

    const updated = await patchUserLimits(targetUserId, request.maxShops);
    if (!updated) {
      return { ok: false, code: 'NOT_FOUND', error: 'User not found' };
    }

    return {
      ok: true,
      data: { userId: updated.id, maxShops: updated.maxShops ?? null },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('updateUserLimits', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update user limits' };
  }
}
