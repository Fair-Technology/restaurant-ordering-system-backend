import { HttpRequest } from '@azure/functions';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction } from '../../_shared/shopAccess';
import {
  validateContentType,
  getFileExtensionFromContentType,
  generateShopBrandingBlobPath,
  generateBlobUrl,
  generateUploadSasUrl,
} from '../../../infrastructure/storage/blobStorageHelpers';
import {
  GenerateShopLogoUploadUrlRequestDto,
  GenerateShopLogoUploadUrlResultDto,
} from './dtos';
import { ApplicationResult } from '../../_shared/types';

export async function executeGenerateShopLogoUploadUrl(
  request: GenerateShopLogoUploadUrlRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GenerateShopLogoUploadUrlResultDto>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'shopId is required and must be a non-empty string',
    };
  }

  if (!request.contentType || typeof request.contentType !== 'string' || request.contentType.trim() === '') {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'contentType is required and must be a non-empty string',
    };
  }

  try {
    validateContentType(request.contentType);

    const shop = await findShopById(request.shopId.trim());
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const access = await authorizeShopAction(httpRequest, shop, 'manage_shop');
    if (!access.ok) return access;

    const imageId = crypto.randomUUID();
    const extension = getFileExtensionFromContentType(request.contentType);
    const blobPath = generateShopBrandingBlobPath(request.shopId.trim(), imageId, extension);
    const blobUrl = generateBlobUrl(blobPath);
    const { sasUrl, expiresAt } = generateUploadSasUrl(blobPath);

    return {
      ok: true,
      data: { imageId, uploadUrl: sasUrl, blobUrl, expiresAt },
    };
  } catch (error: any) {
    if (
      error.message.includes('not authorized') ||
      error.message === 'Authentication required'
    ) {
      return { ok: false, code: 'FORBIDDEN', error: error.message };
    }
    if (error.message.includes('not allowed') || error.message.includes('Unsupported content type')) {
      return { ok: false, code: 'INVALID_INPUT', error: error.message };
    }
    throw error;
  }
}
