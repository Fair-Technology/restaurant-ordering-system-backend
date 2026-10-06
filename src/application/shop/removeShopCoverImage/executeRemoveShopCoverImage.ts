import { HttpRequest } from '@azure/functions';
import {
  findShopById,
  updateShop as updateShopInRepo,
} from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { deleteBlob, extractBlobPath } from '../../../infrastructure/storage/blobStorageHelpers';
import { ShopCoverImageResultDto, toCoverImageResult } from '../setShopCoverImage/dtos';
import { ApplicationResult } from '../../_shared/types';
import { logAudit } from '../../_shared/auditHelpers';

export interface RemoveShopCoverImageRequestDto {
  shopId: string;
}

export async function executeRemoveShopCoverImage(
  request: RemoveShopCoverImageRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ShopCoverImageResultDto>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required and must be a non-empty string' };
  }

  try {
    const shop = await findShopById(request.shopId.trim());
    if (!shop) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };

    const access = await authorizeShopAction(httpRequest, shop, 'manage_shop');
    if (!access.ok) return access;

    const oldUrl = shop.branding?.heroImageUrl ?? null;
    if (!oldUrl || !shop.branding) return { ok: true, data: toCoverImageResult(shop) };

    const result = await updateShopInRepo({
      ...shop,
      branding: { ...shop.branding, heroImageUrl: null },
      updatedAt: new Date().toISOString(),
    });

    const oldPath = oldUrl !== shop.branding.logoUrl ? extractBlobPath(oldUrl) : null;
    if (oldPath) {
      try {
        await deleteBlob(oldPath);
      } catch (e: unknown) {
        console.error('[removeShopCoverImage] blob delete failed:', e instanceof Error ? e.message : e);
      }
    }

    await logAudit({
      shopId: result.id,
      ...toAuditActor(access.actor),
      action: 'shop.cover_image_remove',
      entityType: 'shop',
      entityId: result.id,
      entityName: result.name,
    });

    return { ok: true, data: toCoverImageResult(result) };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to remove shop cover image' };
  }
}
