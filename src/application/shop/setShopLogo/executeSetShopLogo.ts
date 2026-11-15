import { HttpRequest } from '@azure/functions';
import {
  findShopById,
  updateShop as updateShopInRepo,
} from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { deleteBlob, generateBlobUrl } from '../../../infrastructure/storage/blobStorageHelpers';
import { ownedBlobPath, shopBrandingFolder } from '../../../infrastructure/storage/blobUrls';
import { SetShopLogoRequestDto, SetShopLogoResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { logAudit } from '../../_shared/auditHelpers';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import { verifyUploadedImageSize } from '../../_shared/verifyUploadedImageSize';
import { LOGO_MAX_SIZE } from '../../../domain/images/imageRules';

// Extensions the upload-URL step can generate (getFileExtensionFromContentType).
const LOGO_EXTENSIONS = ['.jpg', '.png', '.webp'];
const IMAGE_ID_PATTERN = /^[A-Za-z0-9-]+$/;

export const LOGO_URL_ERROR = 'url must be the logo uploaded for this shop';

export async function executeSetShopLogo(
  request: SetShopLogoRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<SetShopLogoResultDto>> {
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
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const access = await authorizeShopAction(httpRequest, shop, 'manage_shop');
    if (!access.ok) return access;

    // The URL must be exactly one of the blob URLs the upload-URL step could have issued
    // for this shop and imageId: no extra segments, "..", query or fragment.
    const issuedPath = IMAGE_ID_PATTERN.test(imageId)
      ? LOGO_EXTENSIONS.map((ext) => `shops/${shopId}/branding/${imageId}${ext}`).find((p) => request.url === generateBlobUrl(p))
      : undefined;
    if (!issuedPath) return { ok: false, code: 'INVALID_INPUT', error: LOGO_URL_ERROR };

    // Check the real file (10 MB, type) and shrink it to fit the logo box; a logo has no minimum size.
    const uploadError = await verifyUploadedImageSize(issuedPath, LOGO_MAX_SIZE, null, 'Logo', null, 'contain');
    if (uploadError) return uploadError;

    // Delete old logo blob if it exists and differs from the new URL
    const oldLogoUrl = shop.branding?.logoUrl;
    if (oldLogoUrl && oldLogoUrl !== request.url) {
      const oldPath = ownedBlobPath(oldLogoUrl, shopBrandingFolder(shop.id));
      if (oldPath) {
        await deleteBlob(oldPath);
      }
    }

    const updatedBranding = {
      ...(shop.branding ?? { logoUrl: null, heroImageUrl: null, accentColor: null }),
      logoUrl: request.url,
    };

    const updatedShop = {
      ...shop,
      branding: updatedBranding,
      updatedAt: new Date().toISOString(),
    };

    const result = await updateShopInRepo(updatedShop);

    await logAudit({
      shopId: result.id,
      ...toAuditActor(access.actor),
      action: 'shop.logo',
      entityType: 'shop',
      entityId: result.id,
      entityName: result.name,
    });

    return {
      ok: true,
      data: {
        id: result.id,
        slug: result.slug,
        name: result.name,
        isDeleted: result.isDeleted,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
        branding: result.branding,
      },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('setShopLogo', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to set shop logo' };
  }
}
