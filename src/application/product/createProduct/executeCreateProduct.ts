import { HttpRequest } from '@azure/functions';
import { createProduct as createProductInRepo } from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { findCategoryById } from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { checkShopPermission } from '../../_shared/permissions';
import { CreateProductRequestDto, CreateProductResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { Product } from '../../../domain/product/Product';
import { getActorFromAuth, logAudit } from '../../_shared/auditHelpers';

export async function executeCreateProduct(
  request: CreateProductRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<CreateProductResultDto>> {
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

  if (!request.description || typeof request.description !== 'string') {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'description is required and must be a string',
    };
  }

  if (typeof request.price !== 'number' || request.price < 0) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'price is required and must be a non-negative number',
    };
  }

  if (
    !request.taxRateId ||
    typeof request.taxRateId !== 'string' ||
    request.taxRateId.trim() === ''
  ) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'taxRateId is required and must be a non-empty string',
    };
  }

  // Validate categoryIds if provided
  if (request.categoryIds && request.categoryIds.length > 0) {
    // De-duplicate categoryIds
    const uniqueCategoryIds = [...new Set(request.categoryIds)];

    // Validate each categoryId
    const invalidCategoryIds: string[] = [];

    for (const categoryId of uniqueCategoryIds) {
      try {
        const category = await findCategoryById(
          categoryId,
          request.shopId.trim(),
        );
        if (
          !category ||
          category.isDeleted ||
          category.shopId !== request.shopId.trim()
        ) {
          invalidCategoryIds.push(categoryId);
        }
      } catch (error) {
        invalidCategoryIds.push(categoryId);
      }
    }

    if (invalidCategoryIds.length > 0) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        error: `Invalid category IDs: ${invalidCategoryIds.join(', ')}. Categories must exist, be active, and belong to the same shop.`,
      };
    }

    // Update request with de-duplicated categoryIds
    request.categoryIds = uniqueCategoryIds;
  }

  // Validate schedule offer fields if provided
  if (request.schedule?.offerPrice != null) {
    if (!Number.isInteger(request.schedule.offerPrice) || request.schedule.offerPrice <= 0) {
      return { ok: false, code: 'INVALID_INPUT', error: 'schedule.offerPrice must be a positive integer (cents)' };
    }
    if (request.schedule.offerPrice >= request.price) {
      return { ok: false, code: 'INVALID_INPUT', error: 'schedule.offerPrice must be less than the product price' };
    }
    if (request.schedule.offerLabel != null && (typeof request.schedule.offerLabel !== 'string' || request.schedule.offerLabel.length > 50)) {
      return { ok: false, code: 'INVALID_INPUT', error: 'schedule.offerLabel must be a string of at most 50 characters' };
    }
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

    const now = new Date().toISOString();
    const productId = crypto.randomUUID();

    const product: Product = {
      id: productId,
      shopId: request.shopId.trim(),
      name: request.name.trim(),
      description: request.description,
      price: request.price,
      categoryIds: request.categoryIds || [],
      images: request.images || [],
      specialInfo: request.specialInfo,
      variantGroups: request.variantGroups,
      addonGroups: request.addonGroups,
      isAvailable: (request.categoryIds?.length ?? 0) > 0
        ? (request.isAvailable ?? true)
        : false,
      isDeleted: false,
      taxRateId: request.taxRateId ?? null,
      schedule: request.schedule ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const createdProduct = await createProductInRepo(product);

    await logAudit({
      shopId: createdProduct.shopId,
      actorType: 'owner',
      actorId: actor.userId,
      action: 'product.create',
      entityType: 'product',
      entityId: createdProduct.id,
      entityName: createdProduct.name,
    });

    const resultDto: CreateProductResultDto = {
      id: createdProduct.id,
      shopId: createdProduct.shopId,
      name: createdProduct.name,
      description: createdProduct.description,
      price: createdProduct.price,
      isAvailable: createdProduct.isAvailable,
      isDeleted: createdProduct.isDeleted,
      taxRateId: createdProduct.taxRateId ?? null,
      schedule: createdProduct.schedule ?? null,
      createdAt: createdProduct.createdAt,
      updatedAt: createdProduct.updatedAt,
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
      error: 'Failed to create product',
    };
  }
}
