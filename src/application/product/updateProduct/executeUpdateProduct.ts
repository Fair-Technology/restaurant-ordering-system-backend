import { HttpRequest } from '@azure/functions';
import {
  findProductById,
  updateProduct as updateProductInRepo,
} from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { findCategoryById } from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { deleteBlob, extractBlobPath } from '../../../infrastructure/storage/blobStorageHelpers';
import { UpdateProductRequestDto, UpdateProductResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
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
    const product = await findProductById(
      request.productId.trim(),
      request.shopId.trim(),
    );

    if (!product) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        error: 'Product not found',
      };
    }

    const shop = await findShopById(product.shopId);
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const access = await authorizeShopAction(httpRequest, shop, 'manage_menu');
    if (!access.ok) return access;

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

    // Validate categoryIds if provided
    if (request.categoryIds !== undefined && request.categoryIds.length > 0) {
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
      ...(request.specialInfo !== undefined && {
        specialInfo: request.specialInfo,
      }),
      ...(request.variantGroups !== undefined && {
        variantGroups: request.variantGroups,
      }),
      ...(request.addonGroups !== undefined && {
        addonGroups: request.addonGroups,
      }),
      ...(request.isAvailable !== undefined && {
        isAvailable: request.isAvailable,
      }),
      ...(request.taxRateId !== undefined && { taxRateId: request.taxRateId }),
      ...(request.schedule !== undefined && { schedule: request.schedule }),
      updatedAt: new Date().toISOString(),
    };

    const result = await updateProductInRepo(updatedProduct);

    const changes = diffFields(
      product as unknown as Record<string, unknown>,
      updatedProduct as unknown as Record<string, unknown>,
      ['name', 'price', 'isAvailable', 'taxRateId'],
      ['variantGroups', 'addonGroups', 'schedule', 'specialInfo'],
    );
    await logAudit({
      shopId: result.shopId,
      ...toAuditActor(access.actor),
      action: 'product.update',
      entityType: 'product',
      entityId: result.id,
      entityName: result.name,
      changes,
    });

    // Delete blobs for images removed from the array — best effort
    if (request.images !== undefined) {
      const removedImages = (product.images ?? []).filter(
        (old) => !(request.images ?? []).some((n) => n.id === old.id),
      );
      await Promise.allSettled(
        removedImages.map((img) => {
          const path = extractBlobPath(img.url);
          return path ? deleteBlob(path) : Promise.resolve();
        }),
      );
    }

    const resultDto: UpdateProductResultDto = {
      id: result.id,
      shopId: result.shopId,
      name: result.name,
      description: result.description,
      price: result.price,
      isAvailable: result.isAvailable,
      isDeleted: result.isDeleted,
      taxRateId: result.taxRateId ?? null,
      schedule: result.schedule ?? null,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
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
