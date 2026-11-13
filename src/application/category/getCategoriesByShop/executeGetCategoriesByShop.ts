import { HttpRequest } from '@azure/functions';
import { findCategoriesByShopId } from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { authorizeShopRead } from '../../_shared/shopAccess';
import {
  GetCategoriesByShopRequestDto,
  GetCategoriesByShopResultDto,
  CategoryDto,
} from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { logServiceFailure } from '../../_shared/logServiceFailure';

export async function executeGetCategoriesByShop(
  request: GetCategoriesByShopRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetCategoriesByShopResultDto>> {
  // Validate input
  if (
    !request.shopId ||
    typeof request.shopId !== 'string' ||
    request.shopId.trim() === ''
  ) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'shopId is required and must be a non-empty string',
    };
  }

  try {
    const access = await authorizeShopRead(httpRequest, request.shopId.trim());
    if (!access.ok) return access;

    const categories = await findCategoriesByShopId(request.shopId.trim());

    const categoryDtos: CategoryDto[] = categories.map((category) => ({
      id: category.id,
      shopId: category.shopId,
      name: category.name,
      nameTranslations: category.nameTranslations ?? {},
      sortOrder: category.sortOrder,
      icon: category.icon,
      taxClassId: category.taxClassId ?? null,
      isAvailable: category.isAvailable !== false,
      schedule: category.schedule ?? null,
      isDeleted: category.isDeleted,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    }));

    return {
      ok: true,
      data: categoryDtos,
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('getCategoriesByShop', error);
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to retrieve categories',
    };
  }
}
