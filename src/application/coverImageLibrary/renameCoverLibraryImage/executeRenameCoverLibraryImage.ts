import { HttpRequest } from '@azure/functions';
import { getCoverImageLibrary, saveCoverImageLibrary } from '../../../infrastructure/cosmos/system/CosmosCoverImageLibraryRepository';
import { verifySuperAdminToken } from '../../../infrastructure/auth/superAdminAuthHelpers';
import { CoverLibraryImage } from '../../../domain/images/coverImageLibrary';
import { logAudit } from '../../_shared/auditHelpers';
import { ApplicationResult } from '../../_shared/types';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import { RenameCoverLibraryImageRequestDto } from './dtos';

const MAX_NAME_LENGTH = 100;

export async function executeRenameCoverLibraryImage(
  request: RenameCoverLibraryImageRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<CoverLibraryImage>> {
  if (!request.imageId || typeof request.imageId !== 'string' || request.imageId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'imageId is required and must be a non-empty string' };
  }
  if (typeof request.name !== 'string' || request.name.trim() === '' || request.name.trim().length > MAX_NAME_LENGTH) {
    return { ok: false, code: 'INVALID_INPUT', error: 'name is required and must be at most 100 characters' };
  }

  try {
    const adminId = await verifySuperAdminToken(httpRequest);
    if (!adminId) return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };

    const imageId = request.imageId.trim();
    const name = request.name.trim();
    const images = await getCoverImageLibrary();
    const existing = images.find((i) => i.id === imageId);
    if (!existing) return { ok: false, code: 'NOT_FOUND', error: 'Library cover image not found' };

    const updated: CoverLibraryImage = { ...existing, name };
    if (existing.name !== name) {
      await saveCoverImageLibrary(images.map((i) => (i.id === imageId ? updated : i)));
      await logAudit({
        shopId: 'platform',
        actorType: 'superadmin',
        actorId: adminId,
        action: 'platform.cover_image.rename',
        entityType: 'coverImageLibrary',
        entityId: imageId,
        entityName: name,
        changes: [{ field: 'name', from: existing.name, to: name }],
      });
    }

    return { ok: true, data: updated };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('renameCoverLibraryImage', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to rename cover library image' };
  }
}
