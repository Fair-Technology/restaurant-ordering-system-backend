import { findProductsByShopId } from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import {
  findCategoriesByShopId,
  findCategoryById,
} from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import {
  GetProductsByShopRequestDto,
  GetProductsByShopResultDto,
  ProductDto,
} from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { toMenuFieldsDto } from '../menuFieldsDto';

export async function executeGetProductsByShop(
  request: GetProductsByShopRequestDto,
  options: { includeUncategorized?: boolean } = {},
): Promise<ApplicationResult<GetProductsByShopResultDto>> {
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

  try {
    const products = await findProductsByShopId(request.shopId.trim());

    // Fetch category details for all products
    const productDtos: ProductDto[] = [];

    for (const product of products) {
      // Fetch category details for this product
      const categories: Array<{
        id: string;
        name: string;
        sortOrder: number;
        icon?: string;
      }> = [];
      for (const categoryId of product.categoryIds || []) {
        try {
          const category = await findCategoryById(categoryId, product.shopId);
          if (category && !category.isDeleted) {
            categories.push({
              id: category.id,
              name: category.name,
              sortOrder: category.sortOrder,
              icon: category.icon,
            });
          }
        } catch (error) {
          // Skip invalid categories silently
        }
      }

      // Sort categories by sortOrder
      categories.sort((a, b) => a.sortOrder - b.sortOrder);

      productDtos.push({
        id: product.id,
        shopId: product.shopId,
        name: product.name,
        description: product.description,
        price: product.price,
        categories: categories,
        images: product.images,
        variantGroups: product.variantGroups,
        addonGroups: product.addonGroups,
        schedule: product.schedule ?? null,
        isAvailable: product.isAvailable,
        isDeleted: product.isDeleted,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        ...toMenuFieldsDto(product),
      });
    }

    const result = options.includeUncategorized
      ? productDtos
      : productDtos.filter((p) => p.categories.length > 0);

    return {
      ok: true,
      data: result,
    };
  } catch (error) {
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to retrieve products',
    };
  }
}
