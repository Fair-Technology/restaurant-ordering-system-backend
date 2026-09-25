import { HttpRequest } from '@azure/functions';
import {
  createCategory as createCategoryInRepo,
  findCategoriesByShopId,
} from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { checkShopPermission } from '../../_shared/permissions';
import { CreateCategoryRequestDto, CreateCategoryResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { Category } from '../../../domain/category/Category';
import { getActorFromAuth, logAudit } from '../../_shared/auditHelpers';

export async function executeCreateCategory(
  request: CreateCategoryRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<CreateCategoryResultDto>> {
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

  if (
    !request.name ||
    typeof request.name !== 'string' ||
    request.name.trim() === ''
  ) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'name is required and must be a non-empty string',
    };
  }

  try {
    const actor = await getActorFromAuth(httpRequest);
    const userId = actor.userId;

    const shop = await findShopById(request.shopId.trim());
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const permError = checkShopPermission(shop, userId, 'manage_products');
    if (permError) return permError;

    const existing = await findCategoriesByShopId(request.shopId.trim());
    const duplicate = existing.find(
      (c) => c.name.toLowerCase() === request.name.trim().toLowerCase(),
    );
    if (duplicate) {
      return {
        ok: false,
        code: 'CONFLICT',
        error: `A category named "${duplicate.name}" already exists.`,
      };
    }

    const now = new Date().toISOString();
    const categoryId = crypto.randomUUID();

    const category: Category = {
      id: categoryId,
      shopId: request.shopId.trim(),
      name: request.name.trim(),
      sortOrder: request.sortOrder || 0,
      icon: request.icon,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    };

    const createdCategory = await createCategoryInRepo(category);

    await logAudit({
      shopId: createdCategory.shopId,
      actorType: 'owner',
      actorId: actor.userId,
      action: 'category.create',
      entityType: 'category',
      entityId: createdCategory.id,
      entityName: createdCategory.name,
    });

    const resultDto: CreateCategoryResultDto = {
      id: createdCategory.id,
      shopId: createdCategory.shopId,
      name: createdCategory.name,
      sortOrder: createdCategory.sortOrder,
      icon: createdCategory.icon,
      isDeleted: createdCategory.isDeleted,
      createdAt: createdCategory.createdAt,
      updatedAt: createdCategory.updatedAt,
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
      error: 'Failed to create category',
    };
  }
}
