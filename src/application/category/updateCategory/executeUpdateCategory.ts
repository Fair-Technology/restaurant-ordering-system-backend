import { HttpRequest } from '@azure/functions';
import {
  findCategoryById,
  updateCategory as updateCategoryInRepo,
} from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { UpdateCategoryRequestDto, UpdateCategoryResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { diffFields, logAudit } from '../../_shared/auditHelpers';

export async function executeUpdateCategory(
  request: UpdateCategoryRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<UpdateCategoryResultDto>> {
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

    const access = await authorizeShopAction(httpRequest, shop, 'manage_menu');
    if (!access.ok) return access;

    const now = new Date().toISOString();

    const updatedCategory = {
      ...existingCategory,
      name: request.name?.trim() || existingCategory.name,
      sortOrder:
        request.sortOrder !== undefined
          ? request.sortOrder
          : existingCategory.sortOrder,
      icon: request.icon !== undefined ? request.icon : existingCategory.icon,
      updatedAt: now,
    };

    const savedCategory = await updateCategoryInRepo(updatedCategory);

    const changes = diffFields(
      existingCategory as unknown as Record<string, unknown>,
      updatedCategory as unknown as Record<string, unknown>,
      ['name', 'sortOrder', 'icon'],
      [],
    );
    await logAudit({
      shopId: savedCategory.shopId,
      ...toAuditActor(access.actor),
      action: 'category.update',
      entityType: 'category',
      entityId: savedCategory.id,
      entityName: savedCategory.name,
      changes,
    });

    const resultDto: UpdateCategoryResultDto = {
      id: savedCategory.id,
      shopId: savedCategory.shopId,
      name: savedCategory.name,
      sortOrder: savedCategory.sortOrder,
      icon: savedCategory.icon,
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
      error: 'Failed to update category',
    };
  }
}
