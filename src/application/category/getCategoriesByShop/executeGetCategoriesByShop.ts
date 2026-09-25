import { HttpRequest } from '@azure/functions';
import { findCategoriesByShopId } from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { authenticate } from '../../../infrastructure/auth/principal';
import {
  GetCategoriesByShopRequestDto,
  GetCategoriesByShopResultDto,
  CategoryDto,
} from './dtos';
import { ApplicationResult } from '../../_shared/types';

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
    const principal = await authenticate(httpRequest);
    if (principal.kind === 'staff' && principal.shopId !== request.shopId.trim()) {
      return { ok: false, code: 'FORBIDDEN', error: 'You do not have access to this restaurant' };
    }

    const categories = await findCategoriesByShopId(request.shopId.trim());

    const categoryDtos: CategoryDto[] = categories.map((category) => ({
      id: category.id,
      shopId: category.shopId,
      name: category.name,
      sortOrder: category.sortOrder,
      icon: category.icon,
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
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to retrieve categories',
    };
  }
}
