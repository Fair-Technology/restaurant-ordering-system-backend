import { HttpRequest } from '@azure/functions';
import {
  findCategoryById,
  updateCategory as updateCategoryInRepo,
} from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { DELIVERY_TAX_CLASS_FOR_DISHES_ERROR } from '../../../domain/order/orderErrors';
import { DELIVERY_TAX_CLASS_ID } from '../../../domain/reference/ReferenceLists';
import { getReferenceLists } from '../../../infrastructure/cosmos/reference/CosmosReferenceListsRepository';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { UpdateCategoryRequestDto, UpdateCategoryResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { normaliseTranslations } from '../../../domain/menu/menuLanguage';
import { parseCategorySchedule } from '../../../domain/category/Category';
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

    if (request.taxClassId !== undefined) {
      if (request.taxClassId === DELIVERY_TAX_CLASS_ID) {
        return { ok: false, code: 'INVALID_INPUT', error: DELIVERY_TAX_CLASS_FOR_DISHES_ERROR };
      }
      const refs = await getReferenceLists(shop.countryCode ?? '');
      const isActive = refs.taxClasses.some((c) => c.id === request.taxClassId && c.isActive);
      if (!isActive) {
        return { ok: false, code: 'INVALID_INPUT', error: `Unknown tax class: ${request.taxClassId}` };
      }
    }

    let nameTranslations = existingCategory.nameTranslations;
    if (request.nameTranslations !== undefined) {
      const normalised = normaliseTranslations(request.nameTranslations, 120);
      if (typeof normalised === 'string') {
        return { ok: false, code: 'INVALID_INPUT', error: normalised };
      }
      nameTranslations = normalised;
    }

    if (request.isAvailable !== undefined && typeof request.isAvailable !== 'boolean') {
      return { ok: false, code: 'INVALID_INPUT', error: 'isAvailable must be true or false' };
    }
    let schedule = existingCategory.schedule ?? null;
    if (request.schedule !== undefined) {
      const parsed = parseCategorySchedule(request.schedule);
      if (typeof parsed === 'string') return { ok: false, code: 'INVALID_INPUT', error: parsed };
      schedule = parsed;
    }

    const now = new Date().toISOString();

    const updatedCategory = {
      ...existingCategory,
      name: request.name?.trim() || existingCategory.name,
      nameTranslations,
      sortOrder:
        request.sortOrder !== undefined
          ? request.sortOrder
          : existingCategory.sortOrder,
      icon: request.icon !== undefined ? request.icon : existingCategory.icon,
      taxClassId: request.taxClassId ?? existingCategory.taxClassId ?? null,
      isAvailable: request.isAvailable ?? existingCategory.isAvailable !== false,
      schedule,
      updatedAt: now,
    };

    const savedCategory = await updateCategoryInRepo(updatedCategory);

    const changes = diffFields(
      existingCategory as unknown as Record<string, unknown>,
      updatedCategory as unknown as Record<string, unknown>,
      ['name', 'sortOrder', 'icon', 'taxClassId', 'isAvailable'],
      ['nameTranslations', 'schedule'],
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
      nameTranslations: savedCategory.nameTranslations ?? {},
      sortOrder: savedCategory.sortOrder,
      icon: savedCategory.icon,
      taxClassId: savedCategory.taxClassId ?? null,
      isAvailable: savedCategory.isAvailable !== false,
      schedule: savedCategory.schedule ?? null,
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
