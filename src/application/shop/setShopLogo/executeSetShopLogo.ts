import { HttpRequest } from '@azure/functions';
import {
  findShopById,
  updateShop as updateShopInRepo,
} from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { deleteBlob, extractBlobPath } from '../../../infrastructure/storage/blobStorageHelpers';
import { SetShopLogoRequestDto, SetShopLogoResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { logAudit } from '../../_shared/auditHelpers';

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
    const shop = await findShopById(request.shopId.trim());
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const access = await authorizeShopAction(httpRequest, shop, 'manage_shop');
    if (!access.ok) return access;

    // Delete old logo blob if it exists and differs from the new URL
    const oldLogoUrl = shop.branding?.logoUrl;
    if (oldLogoUrl && oldLogoUrl !== request.url) {
      const oldPath = extractBlobPath(oldLogoUrl);
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
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to set shop logo' };
  }
}
