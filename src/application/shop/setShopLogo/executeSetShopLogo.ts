import { HttpRequest } from '@azure/functions';
import {
  findShopById,
  updateShop as updateShopInRepo,
} from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { checkShopPermission } from '../../_shared/permissions';
import { deleteBlob, extractBlobPath } from '../../../infrastructure/storage/blobStorageHelpers';
import { SetShopLogoRequestDto, SetShopLogoResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { getActorFromAuth, logAudit } from '../../_shared/auditHelpers';

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
    const actor = await getActorFromAuth(httpRequest);
    const userId = actor.userId;

    const shop = await findShopById(request.shopId.trim());
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const permError = checkShopPermission(shop, userId, 'manage_shop');
    if (permError) return permError;

    // Delete old logo blob if it exists and differs from the new URL
    const oldLogoUrl = shop.branding?.logoUrl;
    if (oldLogoUrl && oldLogoUrl !== request.url) {
      const oldPath = extractBlobPath(oldLogoUrl);
      if (oldPath) {
        await deleteBlob(oldPath);
      }
    }

    const updatedBranding = {
      ...(shop.branding ?? {
        logoUrl: null,
        heroImageUrl: null,
        colors: { primary: '#1D4ED8', secondary: '#9333EA', tertiary: '#F59E0B', background: '#F9FAFB' },
      }),
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
      actorType: 'owner',
      actorId: actor.userId,
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
