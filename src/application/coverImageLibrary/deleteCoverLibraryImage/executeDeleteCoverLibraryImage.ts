import { HttpRequest } from '@azure/functions';
import { getCoverImageLibrary, saveCoverImageLibrary } from '../../../infrastructure/cosmos/system/CosmosCoverImageLibraryRepository';
import { verifySuperAdminToken } from '../../../infrastructure/auth/superAdminAuthHelpers';
import { ownedBlobPath, coverLibraryFolder } from '../../../infrastructure/storage/blobUrls';
import { deleteBlobWithVariants } from '../../_shared/deleteBlobWithVariants';
import { logAudit } from '../../_shared/auditHelpers';
import { ApplicationResult } from '../../_shared/types';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import { DeleteCoverLibraryImageRequestDto, DeleteCoverLibraryImageResultDto } from './dtos';

// Never touches a shop: a shop that picked this image holds its own independent copy.
export async function executeDeleteCoverLibraryImage(
  request: DeleteCoverLibraryImageRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<DeleteCoverLibraryImageResultDto>> {
  if (!request.imageId || typeof request.imageId !== 'string' || request.imageId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'imageId is required and must be a non-empty string' };
  }

  try {
    const adminId = await verifySuperAdminToken(httpRequest);
    if (!adminId) return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };

    const imageId = request.imageId.trim();
    const images = await getCoverImageLibrary();
    const entry = images.find((i) => i.id === imageId);
    if (!entry) return { ok: false, code: 'NOT_FOUND', error: 'Library cover image not found' };

    await saveCoverImageLibrary(images.filter((i) => i.id !== imageId));

    // Delete the files only after the database write succeeded.
    const path = ownedBlobPath(entry.imageUrl, coverLibraryFolder());
    if (path) {
      try {
        await deleteBlobWithVariants(path, ['card']);
      } catch (e: unknown) {
        console.error('[deleteCoverLibraryImage] blob delete failed:', e instanceof Error ? e.message : e);
      }
    }

    await logAudit({
      shopId: 'platform',
      actorType: 'superadmin',
      actorId: adminId,
      action: 'platform.cover_image.delete',
      entityType: 'coverImageLibrary',
      entityId: imageId,
      entityName: entry.name,
    });

    return { ok: true, data: { id: imageId, deleted: true } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('deleteCoverLibraryImage', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to delete cover library image' };
  }
}
