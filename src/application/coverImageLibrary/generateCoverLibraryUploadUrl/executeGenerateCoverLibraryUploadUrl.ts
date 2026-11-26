import { HttpRequest } from '@azure/functions';
import {
  validateContentType,
  getFileExtensionFromContentType,
  generateCoverLibraryBlobPath,
  generateBlobUrl,
  generateUploadSasUrl,
} from '../../../infrastructure/storage/blobStorageHelpers';
import { verifySuperAdminToken } from '../../../infrastructure/auth/superAdminAuthHelpers';
import { GenerateCoverLibraryUploadUrlRequestDto, GenerateCoverLibraryUploadUrlResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { logServiceFailure } from '../../_shared/logServiceFailure';

export async function executeGenerateCoverLibraryUploadUrl(
  request: GenerateCoverLibraryUploadUrlRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GenerateCoverLibraryUploadUrlResultDto>> {
  if (!request.contentType || typeof request.contentType !== 'string' || request.contentType.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'contentType is required and must be a non-empty string' };
  }

  try {
    const adminId = await verifySuperAdminToken(httpRequest);
    if (!adminId) return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };

    try {
      validateContentType(request.contentType);
    } catch (e: any) {
      return { ok: false, code: 'INVALID_INPUT', error: e.message };
    }

    const imageId = crypto.randomUUID();
    const extension = getFileExtensionFromContentType(request.contentType);
    const blobPath = generateCoverLibraryBlobPath(imageId, extension);
    const blobUrl = generateBlobUrl(blobPath);
    const { sasUrl, expiresAt } = generateUploadSasUrl(blobPath);

    return { ok: true, data: { imageId, uploadUrl: sasUrl, blobUrl, expiresAt } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('generateCoverLibraryUploadUrl', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to generate cover library upload URL' };
  }
}
