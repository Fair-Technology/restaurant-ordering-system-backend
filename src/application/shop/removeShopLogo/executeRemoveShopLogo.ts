import { HttpRequest } from '@azure/functions';
import {
  findShopById,
  updateShop as updateShopInRepo,
} from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { deleteBlob } from '../../../infrastructure/storage/blobStorageHelpers';
import { ownedBlobPath, shopBrandingFolder } from '../../../infrastructure/storage/blobUrls';
import { SetShopLogoResultDto, toLogoResult } from '../setShopLogo/dtos';
import { ApplicationResult } from '../../_shared/types';
import { logAudit } from '../../_shared/auditHelpers';
import { logServiceFailure } from '../../_shared/logServiceFailure';

export interface RemoveShopLogoRequestDto {
  shopId: string;
}

export async function executeRemoveShopLogo(
  request: RemoveShopLogoRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<SetShopLogoResultDto>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required and must be a non-empty string' };
  }

  try {
    const shop = await findShopById(request.shopId.trim());
    if (!shop) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };

    const access = await authorizeShopAction(httpRequest, shop, 'manage_shop');
    if (!access.ok) return access;

    const oldUrl = shop.branding?.logoUrl ?? null;
    if (!oldUrl || !shop.branding) return { ok: true, data: toLogoResult(shop) };

    const result = await updateShopInRepo({
      ...shop,
      branding: { ...shop.branding, logoUrl: null },
      updatedAt: new Date().toISOString(),
    });

    const oldPath = oldUrl !== shop.branding.heroImageUrl ? ownedBlobPath(oldUrl, shopBrandingFolder(shop.id)) : null;
    if (oldPath) {
      try {
        await deleteBlob(oldPath);
      } catch (e: unknown) {
        console.error('[removeShopLogo] blob delete failed:', e instanceof Error ? e.message : e);
      }
    }

    await logAudit({
      shopId: result.id,
      ...toAuditActor(access.actor),
      action: 'shop.logo_remove',
      entityType: 'shop',
      entityId: result.id,
      entityName: result.name,
    });

    return { ok: true, data: toLogoResult(result) };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('removeShopLogo', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to remove shop logo' };
  }
}
