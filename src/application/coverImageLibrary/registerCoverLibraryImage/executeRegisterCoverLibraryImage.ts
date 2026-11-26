import { HttpRequest } from '@azure/functions';
import { getCoverImageLibrary, saveCoverImageLibrary } from '../../../infrastructure/cosmos/system/CosmosCoverImageLibraryRepository';
import { generateBlobUrl, generateCoverLibraryBlobPath } from '../../../infrastructure/storage/blobStorageHelpers';
import { verifySuperAdminToken } from '../../../infrastructure/auth/superAdminAuthHelpers';
import { COVER_IMAGE_SIZE, COVER_IMAGE_CARD_SIZE, COVER_IMAGE_MIN_SOURCE, COVER_IMAGE_WRONG_SIZE, variantSuffix } from '../../../domain/images/imageRules';
import { COVER_IMAGE_LIBRARY_FULL_ERROR, MAX_COVER_LIBRARY_IMAGES, CoverLibraryImage } from '../../../domain/images/coverImageLibrary';
import { verifyUploadedImageSize } from '../../_shared/verifyUploadedImageSize';
import { logAudit } from '../../_shared/auditHelpers';
import { ApplicationResult } from '../../_shared/types';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import { RegisterCoverLibraryImageRequestDto } from './dtos';

// Extensions the upload-URL step can generate (getFileExtensionFromContentType).
const COVER_IMAGE_EXTENSIONS = ['.jpg', '.png', '.webp'];
const IMAGE_ID_PATTERN = /^[A-Za-z0-9-]+$/;
const MAX_NAME_LENGTH = 100;

export const COVER_LIBRARY_URL_ERROR = 'url must be the cover image uploaded for this image id';
export const COVER_LIBRARY_NAME_ERROR = 'name is required and must be at most 100 characters';

export async function executeRegisterCoverLibraryImage(
  request: RegisterCoverLibraryImageRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<CoverLibraryImage>> {
  if (!request.imageId || typeof request.imageId !== 'string' || request.imageId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'imageId is required and must be a non-empty string' };
  }
  if (!request.url || typeof request.url !== 'string' || !request.url.startsWith('https://')) {
    return { ok: false, code: 'INVALID_INPUT', error: 'url is required and must be a valid https URL' };
  }
  if (typeof request.name !== 'string' || request.name.trim() === '' || request.name.trim().length > MAX_NAME_LENGTH) {
    return { ok: false, code: 'INVALID_INPUT', error: COVER_LIBRARY_NAME_ERROR };
  }

  try {
    const adminId = await verifySuperAdminToken(httpRequest);
    if (!adminId) return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };

    const imageId = request.imageId.trim();
    const name = request.name.trim();

    const images = await getCoverImageLibrary();
    if (images.length >= MAX_COVER_LIBRARY_IMAGES) {
      return { ok: false, code: 'LIMIT_REACHED', error: COVER_IMAGE_LIBRARY_FULL_ERROR };
    }

    // The URL must be exactly one of the blob URLs the upload-URL step could have issued for this imageId.
    const issuedPath = IMAGE_ID_PATTERN.test(imageId)
      ? COVER_IMAGE_EXTENSIONS.map((ext) => generateCoverLibraryBlobPath(imageId, ext)).find((p) => request.url === generateBlobUrl(p))
      : undefined;
    if (!issuedPath) return { ok: false, code: 'INVALID_INPUT', error: COVER_LIBRARY_URL_ERROR };

    const sizeError = await verifyUploadedImageSize(
      issuedPath,
      COVER_IMAGE_SIZE,
      COVER_IMAGE_MIN_SOURCE,
      'Cover image',
      COVER_IMAGE_WRONG_SIZE,
      'cover',
      [{ suffix: 'card', size: COVER_IMAGE_CARD_SIZE }],
    );
    if (sizeError) return sizeError;

    const entry: CoverLibraryImage = {
      id: imageId,
      name,
      imageUrl: request.url,
      cardImageUrl: generateBlobUrl(variantSuffix(issuedPath, 'card')),
      createdAt: new Date().toISOString(),
      order: images.length,
    };
    await saveCoverImageLibrary([...images, entry]);

    await logAudit({
      shopId: 'platform',
      actorType: 'superadmin',
      actorId: adminId,
      action: 'platform.cover_image.register',
      entityType: 'coverImageLibrary',
      entityId: imageId,
      entityName: entry.name,
    });

    return { ok: true, data: entry };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('registerCoverLibraryImage', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to register cover library image' };
  }
}
