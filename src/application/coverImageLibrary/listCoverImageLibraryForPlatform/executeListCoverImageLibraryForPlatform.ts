import { HttpRequest } from '@azure/functions';
import { getSortedCoverImageLibrary } from '../../../infrastructure/cosmos/system/CosmosCoverImageLibraryRepository';
import { requirePlatform } from '../../../infrastructure/auth/superAdminAuthHelpers';
import { ApplicationResult } from '../../_shared/types';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import { ListCoverImageLibraryResultDto } from './dtos';

export async function executeListCoverImageLibraryForPlatform(
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ListCoverImageLibraryResultDto>> {
  try {
    const adminId = await requirePlatform(httpRequest, 'read');
    if (!adminId) return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };

    return { ok: true, data: { images: await getSortedCoverImageLibrary() } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('listCoverImageLibraryForPlatform', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to list cover image library' };
  }
}
