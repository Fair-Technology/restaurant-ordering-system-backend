import { HttpRequest } from '@azure/functions';
import { getSystemConfig, upsertSystemConfig } from '../../../infrastructure/cosmos/system/CosmosSystemConfigRepository';
import { ApplicationResult } from '../../_shared/types';
import { UpdateSystemConfigRequestDto, UpdateSystemConfigResultDto } from './dtos';
import { verifySuperAdminToken } from '../../../infrastructure/auth/superAdminAuthHelpers';
import { logAudit } from '../../_shared/auditHelpers';
import { logServiceFailure } from '../../_shared/logServiceFailure';

export async function executeUpdateSystemConfig(
  request: UpdateSystemConfigRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<UpdateSystemConfigResultDto>> {
  if (typeof request.maxShopsDefault !== 'number') {
    return { ok: false, code: 'INVALID_INPUT', error: 'maxShopsDefault must be a number' };
  }
  if (!Number.isInteger(request.maxShopsDefault) || request.maxShopsDefault < 1) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'maxShopsDefault must be an integer >= 1',
    };
  }

  try {
    const adminId = await verifySuperAdminToken(httpRequest);
    if (!adminId) {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }

    const previousConfig = await getSystemConfig();
    const updated = await upsertSystemConfig({ maxShopsDefault: request.maxShopsDefault });

    await logAudit({
      shopId: 'platform',
      actorType: 'superadmin',
      actorId: adminId,
      action: 'config.maxShopsDefault.update',
      entityType: 'systemConfig',
      entityId: 'global',
      entityName: 'Global shop limit default',
      changes: [{ field: 'maxShopsDefault', from: previousConfig.maxShopsDefault, to: updated.maxShopsDefault }],
    });

    return { ok: true, data: { maxShopsDefault: updated.maxShopsDefault } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('updateSystemConfig', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update system config' };
  }
}
