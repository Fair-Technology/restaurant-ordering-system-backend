import { findCategoriesByShopId } from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { findProductsByShopId } from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { getReferenceLists } from '../../../infrastructure/cosmos/reference/CosmosReferenceListsRepository';
import { ApplicationResult } from '../../_shared/types';
import { buildCatalog } from './buildCatalog';
import { GetCatalogResultDto } from './dtos';

interface GetCatalogRequestDto {
  shopId: string;
  lang?: string;
}

export async function executeGetCatalog(
  request: GetCatalogRequestDto,
): Promise<ApplicationResult<GetCatalogResultDto>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'shopId is required and must be a non-empty string',
    };
  }

  try {
    const shopId = request.shopId.trim();

    const [shop, categories, products] = await Promise.all([
      findShopById(shopId),
      findCategoriesByShopId(shopId),
      findProductsByShopId(shopId),
    ]);

    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    if (shop.isPaused) {
      return {
        ok: false,
        code: 'FORBIDDEN',
        error: shop.pausedMessage ?? 'This shop is currently paused',
      };
    }

    const refs = await getReferenceLists(shop.countryCode ?? '');

    return {
      ok: true,
      data: buildCatalog({ shop, categories, products, refs, lang: request.lang, now: new Date() }),
    };
  } catch {
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to retrieve catalog',
    };
  }
}
