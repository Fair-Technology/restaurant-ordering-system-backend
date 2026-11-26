import { HttpRequest } from '@azure/functions';
import {
  findShopById,
  updateShop as updateShopInRepo,
} from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { getCoverImageLibrary } from '../../../infrastructure/cosmos/system/CosmosCoverImageLibraryRepository';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { copyBlob, generateBlobUrl, generateShopBrandingBlobPath } from '../../../infrastructure/storage/blobStorageHelpers';
import { coverLibraryFolder, ownedBlobPath, shopBrandingFolder } from '../../../infrastructure/storage/blobUrls';
import { variantSuffix } from '../../../domain/images/imageRules';
import { ShopCoverImageResultDto, toCoverImageResult } from '../../shop/setShopCoverImage/dtos';
import { UseLibraryCoverImageForShopRequestDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { logAudit } from '../../_shared/auditHelpers';
import { deleteBlobWithVariants } from '../../_shared/deleteBlobWithVariants';
import { logServiceFailure } from '../../_shared/logServiceFailure';

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export async function executeUseLibraryCoverImageForShop(
  request: UseLibraryCoverImageForShopRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ShopCoverImageResultDto>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required and must be a non-empty string' };
  }
  if (!request.libraryImageId || typeof request.libraryImageId !== 'string' || request.libraryImageId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'libraryImageId is required and must be a non-empty string' };
  }

  try {
    const shopId = request.shopId.trim();
    const libraryImageId = request.libraryImageId.trim();
    const shop = await findShopById(shopId);
    if (!shop) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };

    const access = await authorizeShopAction(httpRequest, shop, 'manage_shop');
    if (!access.ok) return access;

    const library = await getCoverImageLibrary();
    const entry = library.find((i) => i.id === libraryImageId);
    if (!entry) return { ok: false, code: 'NOT_FOUND', error: 'Library cover image not found' };

    const sourcePath = ownedBlobPath(entry.imageUrl, coverLibraryFolder());
    if (!sourcePath) return { ok: false, code: 'INTERNAL_ERROR', error: 'Library cover image is not available' };

    const extension = sourcePath.slice(sourcePath.lastIndexOf('.'));
    const contentType = CONTENT_TYPE_BY_EXTENSION[extension.toLowerCase()];
    if (!contentType) return { ok: false, code: 'INTERNAL_ERROR', error: 'Library cover image is not available' };

    // The shop gets its own copy; never a reference to the shared library file.
    const imageId = crypto.randomUUID();
    const destPath = generateShopBrandingBlobPath(shopId, imageId, extension);
    const destUrl = generateBlobUrl(destPath);

    try {
      await copyBlob(sourcePath, destPath, contentType);
    } catch (e: unknown) {
      console.error('[useLibraryCoverImageForShop] cover copy failed:', e instanceof Error ? e.message : e);
      return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to copy library cover image' };
    }
    // The card is a secondary thumbnail: best-effort.
    try {
      await copyBlob(variantSuffix(sourcePath, 'card'), variantSuffix(destPath, 'card'), contentType);
    } catch (e: unknown) {
      console.error('[useLibraryCoverImageForShop] card copy failed:', e instanceof Error ? e.message : e);
    }

    const oldUrl = shop.branding?.heroImageUrl ?? null;
    const result = await updateShopInRepo({
      ...shop,
      branding: { ...(shop.branding ?? { logoUrl: null, heroImageUrl: null, accentColor: null }), heroImageUrl: destUrl },
      updatedAt: new Date().toISOString(),
    });

    // Delete the replaced file only after the database write succeeded.
    if (oldUrl && oldUrl !== destUrl && oldUrl !== shop.branding?.logoUrl) {
      const oldPath = ownedBlobPath(oldUrl, shopBrandingFolder(shopId));
      if (oldPath) {
        try {
          await deleteBlobWithVariants(oldPath, ['card']);
        } catch (e: unknown) {
          console.error('[useLibraryCoverImageForShop] old blob delete failed:', e instanceof Error ? e.message : e);
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
    logServiceFailure('useLibraryCoverImageForShop', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to set shop cover image from library' };
  }
}
