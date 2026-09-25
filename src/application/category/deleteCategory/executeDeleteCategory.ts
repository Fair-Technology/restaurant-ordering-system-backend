import { HttpRequest } from '@azure/functions';
import {
  findCategoryById,
  updateCategory,
} from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { checkShopPermission } from '../../_shared/permissions';
import { DeleteCategoryRequestDto, DeleteCategoryResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { getActorFromAuth, logAudit } from '../../_shared/auditHelpers';

export async function executeDeleteCategory(
  request: DeleteCategoryRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<DeleteCategoryResultDto>> {
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
    const actor = await getActorFromAuth(httpRequest);
    const userId = actor.userId;

    const existingCategory = await findCategoryById(
      request.categoryId.trim(),
      request.shopId.trim(),
    );

    if (!existingCategory) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        error: 'Category not found',
      };
    }

    const shop = await findShopById(existingCategory.shopId);
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const permError = checkShopPermission(shop, userId, 'manage_products');
    if (permError) return permError;

    const now = new Date().toISOString();

    // Soft delete
    const deletedCategory = {
      ...existingCategory,
      isDeleted: true,
      updatedAt: now,
    };

    const savedCategory = await updateCategory(deletedCategory);

    await logAudit({
      shopId: savedCategory.shopId,
      actorType: 'owner',
      actorId: actor.userId,
      action: 'category.delete',
      entityType: 'category',
      entityId: savedCategory.id,
      entityName: savedCategory.name,
    });

    const resultDto: DeleteCategoryResultDto = {
      id: savedCategory.id,
      shopId: savedCategory.shopId,
      name: savedCategory.name,
      sortOrder: savedCategory.sortOrder,
      isDeleted: savedCategory.isDeleted,
      createdAt: savedCategory.createdAt,
      updatedAt: savedCategory.updatedAt,
    };

    return {
      ok: true,
      data: resultDto,
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to delete category',
    };
  }
}
