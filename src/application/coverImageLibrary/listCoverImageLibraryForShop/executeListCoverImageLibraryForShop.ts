import { HttpRequest } from '@azure/functions';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { getSortedCoverImageLibrary } from '../../../infrastructure/cosmos/system/CosmosCoverImageLibraryRepository';
import { authorizeShopAction } from '../../_shared/shopAccess';
import { ApplicationResult } from '../../_shared/types';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import { ListCoverImageLibraryForShopRequestDto, ListCoverImageLibraryResultDto } from './dtos';

export async function executeListCoverImageLibraryForShop(
  request: ListCoverImageLibraryForShopRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ListCoverImageLibraryResultDto>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required and must be a non-empty string' };
  }

  try {
    const shop = await findShopById(request.shopId.trim());
    if (!shop) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };

    const access = await authorizeShopAction(httpRequest, shop, 'manage_shop');
    if (!access.ok) return access;

    return { ok: true, data: { images: await getSortedCoverImageLibrary() } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('listCoverImageLibraryForShop', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to list cover image library' };
  }
}
