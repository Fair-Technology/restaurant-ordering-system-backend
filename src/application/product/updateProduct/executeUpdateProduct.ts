import { HttpRequest } from '@azure/functions';
import {
  findProductById,
  updateProduct as updateProductInRepo,
} from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { findCategoriesByShopId } from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { Category } from '../../../domain/category/Category';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { getReferenceLists } from '../../../infrastructure/cosmos/reference/CosmosReferenceListsRepository';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { deleteBlob, extractBlobPath } from '../../../infrastructure/storage/blobStorageHelpers';
import { UpdateProductRequestDto, UpdateProductResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { validateMenuFields } from '../menuFields';
import { toMenuFieldsDto } from '../menuFieldsDto';
import { diffFields, logAudit } from '../../_shared/auditHelpers';

export async function executeUpdateProduct(
  request: UpdateProductRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<UpdateProductResultDto>> {
  // Validate input
  if (
    !request.productId ||
    typeof request.productId !== 'string' ||
    request.productId.trim() === ''
  ) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'productId is required and must be a non-empty string',
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
    const shopId = request.shopId.trim();
    const productId = request.productId.trim();
    const needsCategoryLookup = request.categoryIds !== undefined && request.categoryIds.length > 0;

    // The product and shop reads don't depend on each other — findProductById
    // is already keyed by shopId as the partition key, so the product's own
    // shopId is guaranteed to match once it's found. The category existence
    // check (when there are categoryIds to validate) only needs shopId too.
    // Firing all three at once, instead of one after another and then a
    // findCategoryById per category id, is most of why this used to take
    // seconds.
    const [product, shop, shopCategories] = await Promise.all([
      findProductById(productId, shopId),
      findShopById(shopId),
      needsCategoryLookup ? findCategoriesByShopId(shopId) : Promise.resolve<Category[]>([]),
    ]);

    if (!product) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        error: 'Product not found',
      };
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

    const menu = validateMenuFields(request, refs, product);
    if ('error' in menu) {
      return { ok: false, code: 'INVALID_INPUT', error: menu.error };
    }

    // Guard: cannot set isAvailable=true on a product with no categories
    if (request.isAvailable === true) {
      const effectiveCategoryIds =
        request.categoryIds !== undefined ? request.categoryIds : product.categoryIds;
      if (effectiveCategoryIds.length === 0) {
        return {
          ok: false,
          code: 'INVALID_INPUT',
          error: 'A product must have at least one category before it can be made available.',
        };
      }
    }

    // Validate categoryIds if provided, using the shop's categories already
    // fetched above instead of a read per category id.
    if (needsCategoryLookup) {
      const uniqueCategoryIds = [...new Set(request.categoryIds!)];
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

      // Update request with de-duplicated categoryIds
      request.categoryIds = uniqueCategoryIds;
    }

    // Validate schedule if provided
    if (request.schedule !== undefined && request.schedule !== null) {
      const s = request.schedule;
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const timeRegex = /^\d{2}:\d{2}$/;
      if (!dateRegex.test(s.startDate)) {
        return { ok: false, code: 'INVALID_INPUT', error: 'schedule.startDate must be in YYYY-MM-DD format' };
      }
      if (s.startTime && !timeRegex.test(s.startTime)) {
        return { ok: false, code: 'INVALID_INPUT', error: 'schedule.startTime must be in HH:mm format' };
      }
      if (s.endTime && !timeRegex.test(s.endTime)) {
        return { ok: false, code: 'INVALID_INPUT', error: 'schedule.endTime must be in HH:mm format' };
      }
      if (s.endDate) {
        if (!dateRegex.test(s.endDate)) {
          return { ok: false, code: 'INVALID_INPUT', error: 'schedule.endDate must be in YYYY-MM-DD format' };
        }
        if (s.endDate < s.startDate) {
          return { ok: false, code: 'INVALID_INPUT', error: 'schedule.endDate must be on or after startDate' };
        }
      }
      if (s.startTime && s.endTime && s.endTime <= s.startTime) {
        return { ok: false, code: 'INVALID_INPUT', error: 'schedule.endTime must be after startTime' };
      }
      if (s.daysOfWeek) {
        if (s.daysOfWeek.length === 0) {
          return { ok: false, code: 'INVALID_INPUT', error: 'schedule.daysOfWeek must contain at least one day' };
        }
        for (const day of s.daysOfWeek) {
          if (!Number.isInteger(day) || day < 0 || day > 6) {
            return { ok: false, code: 'INVALID_INPUT', error: 'schedule.daysOfWeek values must be integers 0–6' };
          }
        }
      }
      if (s.offerPrice != null) {
        if (!Number.isInteger(s.offerPrice) || s.offerPrice <= 0) {
          return { ok: false, code: 'INVALID_INPUT', error: 'schedule.offerPrice must be a positive integer (cents)' };
        }
        const effectivePrice = request.price !== undefined ? request.price : product.price;
        if (s.offerPrice >= effectivePrice) {
          return { ok: false, code: 'INVALID_INPUT', error: 'schedule.offerPrice must be less than the product price' };
        }
        if (s.offerLabel != null && (typeof s.offerLabel !== 'string' || s.offerLabel.length > 50)) {
          return { ok: false, code: 'INVALID_INPUT', error: 'schedule.offerLabel must be a string of at most 50 characters' };
        }
      }
    }

    // Update only provided fields
    const updatedProduct = {
      ...product,
      ...(request.name !== undefined && { name: request.name }),
      ...(request.description !== undefined && {
        description: request.description,
      }),
      ...(request.price !== undefined && { price: request.price }),
      ...(request.categoryIds !== undefined && {
        categoryIds: request.categoryIds,
      }),
      ...(request.images !== undefined && { images: request.images }),
      ...(request.isAvailable !== undefined && {
        isAvailable: request.isAvailable,
      }),
      ...(request.schedule !== undefined && { schedule: request.schedule }),
      ...menu,
      updatedAt: new Date().toISOString(),
    };

    const result = await updateProductInRepo(updatedProduct);

    const changes = diffFields(
      product as unknown as Record<string, unknown>,
      updatedProduct as unknown as Record<string, unknown>,
      ['name', 'price', 'isAvailable', 'spiceLevel', 'prepMinutes', 'taxClassId'],
      [
        'variantGroups',
        'addonGroups',
        'schedule',
        'allergenIds',
        'additiveIds',
        'dietaryTagIds',
        'unavailableModes',
        'nameTranslations',
        'descriptionTranslations',
      ],
    );
    // The audit write and any removed-image blob cleanup don't depend on
    // each other, so run them together instead of one after the other.
    const removedImages = request.images !== undefined
      ? (product.images ?? []).filter((old) => !(request.images ?? []).some((n) => n.id === old.id))
      : [];
    await Promise.all([
      logAudit({
        shopId: result.shopId,
        ...toAuditActor(access.actor),
        action: 'product.update',
        entityType: 'product',
        entityId: result.id,
        entityName: result.name,
        changes,
      }),
      // Delete blobs for images removed from the array — best effort
      Promise.allSettled(
        removedImages.map((img) => {
          const path = extractBlobPath(img.url);
          return path ? deleteBlob(path) : Promise.resolve();
        }),
      ),
    ]);

    const resultDto: UpdateProductResultDto = {
      id: result.id,
      shopId: result.shopId,
      name: result.name,
      description: result.description,
      price: result.price,
      isAvailable: result.isAvailable,
      isDeleted: result.isDeleted,
      schedule: result.schedule ?? null,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      ...toMenuFieldsDto(result),
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
      error: 'Failed to update product',
    };
  }
}
