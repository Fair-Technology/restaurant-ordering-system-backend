import { HttpRequest } from '@azure/functions';
import { getSystemConfig } from '../../../infrastructure/cosmos/system/CosmosSystemConfigRepository';
import { ApplicationResult } from '../../_shared/types';
import { GetSystemConfigResultDto } from './dtos';
import { verifySuperAdminToken } from '../../../infrastructure/auth/superAdminAuthHelpers';

export async function executeGetSystemConfig(
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetSystemConfigResultDto>> {
  try {
    const adminId = await verifySuperAdminToken(httpRequest);
    if (!adminId) {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }

    const config = await getSystemConfig();
    return { ok: true, data: { maxShopsDefault: config.maxShopsDefault } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to get system config' };
  }
}
