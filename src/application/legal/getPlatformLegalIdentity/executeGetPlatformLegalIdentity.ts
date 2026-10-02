import { HttpRequest } from '@azure/functions';
import { getUserIdFromAuth } from '../../../infrastructure/auth/authHelpers';
import { findUserById } from '../../../infrastructure/cosmos/user/CosmosUserRepository';
import { getPlatformLegalIdentity } from '../../../infrastructure/cosmos/system/CosmosPlatformLegalIdentityRepository';
import { ApplicationResult } from '../../_shared/types';
import { PlatformLegalIdentityDto } from '../dtos';
import { toPlatformLegalIdentityDto } from '../toPlatformLegalIdentityDto';

export async function executeGetPlatformLegalIdentity(
  httpRequest: HttpRequest,
): Promise<ApplicationResult<PlatformLegalIdentityDto>> {
  try {
    const userId = await getUserIdFromAuth(httpRequest);
    const user = await findUserById(userId);
    if (user?.systemRole !== 'superadmin') {
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
