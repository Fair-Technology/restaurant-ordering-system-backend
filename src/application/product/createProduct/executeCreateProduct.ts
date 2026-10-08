import { HttpRequest } from '@azure/functions';
import { createProduct as createProductInRepo } from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { findCategoriesByShopId } from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { Category } from '../../../domain/category/Category';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { getReferenceLists } from '../../../infrastructure/cosmos/reference/CosmosReferenceListsRepository';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { CreateProductRequestDto, CreateProductResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { Product } from '../../../domain/product/Product';
import { validateMenuFields } from '../menuFields';
import { toMenuFieldsDto } from '../menuFieldsDto';
import { logAudit } from '../../_shared/auditHelpers';

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

  // De-duplicate categoryIds up front; the DB-backed existence check runs
  // below, alongside the shop lookup, once we're inside the try block.
  const uniqueCategoryIds = request.categoryIds && request.categoryIds.length > 0
    ? [...new Set(request.categoryIds)]
    : [];

  try {
    const shopId = request.shopId.trim();
    // The shop and (when needed) its live categories are two independent
    // reads — fetch both at once instead of the shop first and then a
    // findCategoryById per category id, which is what made this take
    // seconds with more than one or two categories selected.
    const [shop, shopCategories] = await Promise.all([
      findShopById(shopId),
      uniqueCategoryIds.length > 0 ? findCategoriesByShopId(shopId) : Promise.resolve<Category[]>([]),
    ]);

    // Validate categoryIds if provided — same precedence as before: a bad
    // category id is reported even if the shop itself doesn't exist.
    if (uniqueCategoryIds.length > 0) {
      const categoriesById = new Map(shopCategories.map((c) => [c.id, c]));
      const invalidCategoryIds = uniqueCategoryIds.filter((categoryId) => {
        const category = categoriesById.get(categoryId);
        return !category || category.isDeleted || category.shopId !== shopId;
      });
      if (invalidCategoryIds.length > 0) {
        return {
          ok: false,
          code: 'INVALID_INPUT',
          error: `Invalid category IDs: ${invalidCategoryIds.join(', ')}. Categories must exist, be active, and belong to the same shop.`,
        };
      }
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

    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    // Authorization and the reference lists are independent reads too —
    // both only need `shop`, not each other's result.
    const [access, refs] = await Promise.all([
      authorizeShopAction(httpRequest, shop, 'manage_menu'),
      getReferenceLists(shop.countryCode ?? ''),
    ]);
    if (!access.ok) return access;

    const menu = validateMenuFields(request, refs, null);
    if ('error' in menu) {
      return { ok: false, code: 'INVALID_INPUT', error: menu.error };
    }

    const now = new Date().toISOString();
    const productId = crypto.randomUUID();

    const product: Product = {
      id: productId,
      shopId: request.shopId.trim(),
      name: request.name.trim(),
      description: request.description,
      nameTranslations: menu.nameTranslations ?? {},
      descriptionTranslations: menu.descriptionTranslations ?? {},
      price: request.price,
      categoryIds: request.categoryIds || [],
      images: request.images || [],
      variantGroups: menu.variantGroups ?? request.variantGroups,
      addonGroups: menu.addonGroups ?? request.addonGroups,
      allergenIds: menu.allergenIds ?? null,
      additiveIds: menu.additiveIds ?? null,
      dietaryTagIds: menu.dietaryTagIds ?? [],
      spiceLevel: menu.spiceLevel ?? null,
      prepMinutes: menu.prepMinutes ?? null,
      unavailableModes: menu.unavailableModes ?? [],
      taxClassId: menu.taxClassId ?? null,
      isAvailable: (request.categoryIds?.length ?? 0) > 0
        ? (request.isAvailable ?? true)
        : false,
      isDeleted: false,
      schedule: request.schedule ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const createdProduct = await createProductInRepo(product);

    await logAudit({
      shopId: createdProduct.shopId,
      ...toAuditActor(access.actor),
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
      schedule: createdProduct.schedule ?? null,
      createdAt: createdProduct.createdAt,
      updatedAt: createdProduct.updatedAt,
      ...toMenuFieldsDto(createdProduct),
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
