import { findProductById } from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction } from '../../_shared/shopAccess';
import {
  validateContentType,
  validateMaxSizeBytes,
  getFileExtensionFromContentType,
  generateBlobPath,
  generateBlobUrl,
  generateUploadSasUrl,
} from '../../../infrastructure/storage/blobStorageHelpers';
import { GenerateImageUploadUrlRequestDto, GenerateImageUploadUrlResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { HttpRequest } from '@azure/functions';

export async function executeGenerateImageUploadUrl(
  request: GenerateImageUploadUrlRequestDto,
  httpRequest: HttpRequest
): Promise<ApplicationResult<GenerateImageUploadUrlResultDto>> {
  // Validate input
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'shopId is required and must be a non-empty string',
    };
  }

  if (!request.productId || typeof request.productId !== 'string' || request.productId.trim() === '') {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'productId is required and must be a non-empty string',
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
    validateMaxSizeBytes(request.maxSizeBytes);

    const shop = await findShopById(request.shopId.trim());
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const access = await authorizeShopAction(httpRequest, shop, 'manage_menu');
    if (!access.ok) return access;

    // Verify product exists
    const product = await findProductById(request.productId.trim(), request.shopId.trim());
    if (!product) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        error: 'Product not found',
      };
    }

    const imageId = crypto.randomUUID();
    const extension = getFileExtensionFromContentType(request.contentType);
    const blobPath = generateBlobPath(request.shopId.trim(), request.productId.trim(), imageId, extension);
    const blobUrl = generateBlobUrl(blobPath);
    const { sasUrl, expiresAt } = generateUploadSasUrl(blobPath);

    return {
      ok: true,
      data: {
        imageId,
        uploadUrl: sasUrl,
        blobUrl,
        expiresAt,
      },
    };
  } catch (error: any) {
    if (error.message.includes('not authorized') || error.message.includes('Authentication required')) {
      return {
        ok: false,
        code: 'FORBIDDEN',
        error: error.message,
      };
    }

    if (error.message.includes('not allowed') || error.message.includes('Unsupported content type')) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        error: error.message,
      };
    }

    throw error;
  }
}
