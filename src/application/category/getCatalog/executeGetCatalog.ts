import { findCategoriesByShopId } from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { findProductsByShopId } from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { getReferenceLists } from '../../../infrastructure/cosmos/reference/CosmosReferenceListsRepository';
import { findShopOptionGroupsByShopId } from '../../../infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository';
import { resolveProductOptionGroups } from '../../../domain/product/optionGroupRefs';
import { isShopOffline } from '../../../domain/shop/Shop';
import { ApplicationResult } from '../../_shared/types';
import { horizonEndMs, parseSlotStart } from '../../../domain/order/scheduling';
import { getScheduleHorizonDays } from '../../_shared/scheduleHorizon';
import { buildCatalog } from './buildCatalog';
import { GetCatalogResultDto } from './dtos';
import { logServiceFailure } from '../../_shared/logServiceFailure';

interface GetCatalogRequestDto {
  shopId: string;
  lang?: string;
  at?: string; // ISO instant on a quarter hour: judge the menu as of that moment
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

  let parsedAt: Date | null = null;
  if (request.at !== undefined) {
    parsedAt = parseSlotStart(request.at);
    if (!parsedAt) return { ok: false, code: 'INVALID_INPUT', error: 'at must be an ISO instant on a quarter hour' };
  }

  try {
    const shopId = request.shopId.trim();

    const [shop, categories, products, library] = await Promise.all([
      findShopById(shopId),
      findCategoriesByShopId(shopId),
      findProductsByShopId(shopId),
      findShopOptionGroupsByShopId(shopId),
    ]);

    if (!shop || shop.isDeleted) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    if (isShopOffline(shop)) {
      return {
        ok: false,
        code: 'FORBIDDEN',
        error: shop.pausedMessage ?? 'This shop is currently paused',
      };
    }

    const now = new Date();
    if (parsedAt) {
      if (parsedAt.getTime() <= now.getTime()) return { ok: false, code: 'INVALID_INPUT', error: 'at must be in the future' };
      const horizonDays = await getScheduleHorizonDays();
      if (parsedAt.getTime() > horizonEndMs(shop, now, horizonDays)) {
        return { ok: false, code: 'INVALID_INPUT', error: 'at is beyond the booking horizon' };
      }
    }

    const refs = await getReferenceLists(shop.countryCode ?? '');

    const libraryMap = new Map(library.map((g) => [g.id, g]));
    const resolved = products.map((p) => resolveProductOptionGroups(p, libraryMap));

    return {
      ok: true,
      data: buildCatalog({ shop, categories, products: resolved, refs, lang: request.lang, now, ...(parsedAt ? { at: parsedAt } : {}) }),
    };
  } catch (error) {
    logServiceFailure('getCatalog', error);
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to retrieve catalog',
    };
  }
}
