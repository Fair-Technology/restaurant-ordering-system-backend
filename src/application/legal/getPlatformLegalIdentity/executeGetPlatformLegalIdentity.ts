import { HttpRequest } from '@azure/functions';
import { getPlatformLegalIdentity } from '../../../infrastructure/cosmos/system/CosmosPlatformLegalIdentityRepository';
import { ApplicationResult } from '../../_shared/types';
import { PlatformLegalIdentityDto } from '../dtos';
import { toPlatformLegalIdentityDto } from '../toPlatformLegalIdentityDto';
import { verifySuperAdminToken } from '../../../infrastructure/auth/superAdminAuthHelpers';

export async function executeGetPlatformLegalIdentity(
  httpRequest: HttpRequest,
): Promise<ApplicationResult<PlatformLegalIdentityDto>> {
  try {
    const adminId = await verifySuperAdminToken(httpRequest);
    if (!adminId) {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }
    return { ok: true, data: toPlatformLegalIdentityDto(await getPlatformLegalIdentity()) };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to load platform legal identity' };
  }
}
