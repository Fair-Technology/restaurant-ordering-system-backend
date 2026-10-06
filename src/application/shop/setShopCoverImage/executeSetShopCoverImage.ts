import { HttpRequest } from '@azure/functions';
import {
  findShopById,
  updateShop as updateShopInRepo,
} from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { deleteBlob, extractBlobPath, generateBlobUrl } from '../../../infrastructure/storage/blobStorageHelpers';
import { SetShopCoverImageRequestDto, ShopCoverImageResultDto, toCoverImageResult } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { logAudit } from '../../_shared/auditHelpers';

// Extensions the upload-URL step can generate (getFileExtensionFromContentType).
const COVER_IMAGE_EXTENSIONS = ['.jpg', '.png', '.webp'];
const IMAGE_ID_PATTERN = /^[A-Za-z0-9-]+$/;

export const COVER_IMAGE_URL_ERROR = 'url must be the cover image uploaded for this shop';

export async function executeSetShopCoverImage(
  request: SetShopCoverImageRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ShopCoverImageResultDto>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required and must be a non-empty string' };
  }

  if (!request.imageId || typeof request.imageId !== 'string' || request.imageId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'imageId is required and must be a non-empty string' };
  }

  if (!request.url || typeof request.url !== 'string' || !request.url.startsWith('https://')) {
    return { ok: false, code: 'INVALID_INPUT', error: 'url is required and must be a valid https URL' };
  }

  try {
    const shopId = request.shopId.trim();
    const imageId = request.imageId.trim();
    const shop = await findShopById(shopId);
    if (!shop) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };

    const access = await authorizeShopAction(httpRequest, shop, 'manage_shop');
    if (!access.ok) return access;

    // The URL must be exactly one of the blob URLs the upload-URL step could have issued
    // for this shop and imageId: no extra segments, "..", query or fragment.
    const isIssuedUrl =
      IMAGE_ID_PATTERN.test(imageId) &&
      COVER_IMAGE_EXTENSIONS.some((ext) => request.url === generateBlobUrl(`shops/${shopId}/branding/${imageId}${ext}`));
    if (!isIssuedUrl) {
      return { ok: false, code: 'INVALID_INPUT', error: COVER_IMAGE_URL_ERROR };
    }

    const oldUrl = shop.branding?.heroImageUrl ?? null;
    const result = await updateShopInRepo({
      ...shop,
      branding: { ...(shop.branding ?? { logoUrl: null, heroImageUrl: null, accentColor: null }), heroImageUrl: request.url },
      updatedAt: new Date().toISOString(),
    });

    // Delete the replaced file only after the database write succeeded.
    if (oldUrl && oldUrl !== request.url && oldUrl !== shop.branding?.logoUrl) {
      const oldPath = extractBlobPath(oldUrl);
      if (oldPath) {
        try {
          await deleteBlob(oldPath);
        } catch (e: unknown) {
          console.error('[setShopCoverImage] old blob delete failed:', e instanceof Error ? e.message : e);
        }
      }
    }

    await logAudit({
      shopId: result.id,
      ...toAuditActor(access.actor),
      action: 'shop.cover_image',
      entityType: 'shop',
      entityId: result.id,
      entityName: result.name,
    });

    return { ok: true, data: toCoverImageResult(result) };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to set shop cover image' };
  }
}
