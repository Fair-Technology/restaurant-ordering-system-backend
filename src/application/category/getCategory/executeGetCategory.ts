import { HttpRequest } from '@azure/functions';
import { findCategoryById } from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { authenticate } from '../../../infrastructure/auth/principal';
import { GetCategoryRequestDto, GetCategoryResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';

export async function executeGetCategory(
  request: GetCategoryRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetCategoryResultDto>> {
  // Validate input
  if (
    !request.categoryId ||
    typeof request.categoryId !== 'string' ||
    request.categoryId.trim() === ''
  ) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'categoryId is required and must be a non-empty string',
    };
  }

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

    const category = await findCategoryById(
      request.categoryId.trim(),
      request.shopId.trim(),
    );

    if (!category) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        error: 'Category not found',
      };
    }

    const categoryDto: GetCategoryResultDto = {
      id: category.id,
      shopId: category.shopId,
      name: category.name,
      nameTranslations: category.nameTranslations ?? {},
      sortOrder: category.sortOrder,
      icon: category.icon,
      taxClassId: category.taxClassId ?? null,
      isDeleted: category.isDeleted,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };

    return {
      ok: true,
      data: categoryDto,
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to retrieve category',
    };
  }
}
