import { HttpRequest } from '@azure/functions';
import { findProductById } from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { findCategoryById } from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { authenticate } from '../../../infrastructure/auth/principal';
import { GetProductRequestDto, GetProductResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { toMenuFieldsDto } from '../menuFieldsDto';

export async function executeGetProduct(
  request: GetProductRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetProductResultDto>> {
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
    const principal = await authenticate(httpRequest);
    if (principal.kind === 'staff' && principal.shopId !== request.shopId.trim()) {
      return { ok: false, code: 'FORBIDDEN', error: 'You do not have access to this restaurant' };
    }

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

    const categories: { id: string; name: string; sortOrder: number; icon?: string }[] = [];
    for (const categoryId of product.categoryIds || []) {
      try {
        const category = await findCategoryById(categoryId, product.shopId);
        if (category && !category.isDeleted) {
          categories.push({ id: category.id, name: category.name, sortOrder: category.sortOrder, icon: category.icon });
        }
      } catch {
        // Skip invalid categories silently
      }
    }
    categories.sort((a, b) => a.sortOrder - b.sortOrder);

    const productDto: GetProductResultDto = {
      id: product.id,
      shopId: product.shopId,
      name: product.name,
      description: product.description,
      price: product.price,
      isAvailable: product.isAvailable,
      isDeleted: product.isDeleted,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      images: product.images ?? [],
      categories,
      variantGroups: product.variantGroups,
      addonGroups: product.addonGroups,
      schedule: product.schedule ?? null,
      ...toMenuFieldsDto(product),
    };

    return {
      ok: true,
      data: productDto,
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to retrieve product',
    };
  }
}
