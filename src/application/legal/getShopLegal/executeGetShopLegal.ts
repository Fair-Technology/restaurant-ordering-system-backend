import { HttpRequest } from '@azure/functions';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { getPlatformLegalIdentity } from '../../../infrastructure/cosmos/system/CosmosPlatformLegalIdentityRepository';
import { authorizeShopAction } from '../../_shared/shopAccess';
import { ApplicationResult } from '../../_shared/types';
import { ShopLegalSettingsDto } from '../dtos';
import { toShopLegalSettingsDto } from '../toShopLegalSettingsDto';
import { logServiceFailure } from '../../_shared/logServiceFailure';

export async function executeGetShopLegal(
  input: { shopId: string },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ShopLegalSettingsDto>> {
  if (!input.shopId || input.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }
  try {
    const shop = await findShopById(input.shopId.trim());
    if (!shop || shop.isDeleted) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }
    const access = await authorizeShopAction(httpRequest, shop, 'manage_shop', { allowPlatformRead: true });
    if (!access.ok) return access;

    const identity = await getPlatformLegalIdentity();
    return { ok: true, data: toShopLegalSettingsDto(shop, identity, access.actor.actorType === 'owner') };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('getShopLegal', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to load legal settings' };
  }
}
