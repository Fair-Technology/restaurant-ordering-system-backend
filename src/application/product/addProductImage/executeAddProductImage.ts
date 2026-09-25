import {
  findProductById,
  updateProduct as updateProductInRepo,
} from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction } from '../../_shared/shopAccess';
import { AddProductImageRequestDto, AddProductImageResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { ProductImage } from '../../../domain/product/Product';
import { HttpRequest } from '@azure/functions';

export async function executeAddProductImage(
  request: AddProductImageRequestDto,
  httpRequest: HttpRequest
): Promise<ApplicationResult<AddProductImageResultDto>> {
  // Validate input
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'shopId is required and must be a non-empty string',
    };
  }

  if (!request.productId || typeof request.productId !== 'string' || request.productId.trim() === '') {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'productId is required and must be a non-empty string',
    };
  }

  if (!request.imageId || typeof request.imageId !== 'string' || request.imageId.trim() === '') {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'imageId is required and must be a non-empty string',
    };
  }

  if (!request.url || typeof request.url !== 'string' || request.url.trim() === '') {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'url is required and must be a non-empty string',
    };
  }

  if (request.alt !== undefined && typeof request.alt !== 'string') {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'alt must be a string if provided',
    };
  }

  if (request.sortOrder !== undefined && (typeof request.sortOrder !== 'number' || !Number.isInteger(request.sortOrder))) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'sortOrder must be an integer if provided',
    };
  }

  try {
    const shop = await findShopById(request.shopId.trim());
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const access = await authorizeShopAction(httpRequest, shop, 'manage_menu');
    if (!access.ok) return access;

    const product = await findProductById(request.productId.trim(), request.shopId.trim());
    if (!product) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        error: 'Product not found',
      };
    }

    const now = new Date().toISOString();
    const newImage: ProductImage = {
      id: request.imageId.trim(),
      url: request.url.trim(),
      alt: request.alt?.trim(),
      sortOrder: request.sortOrder,
      createdAt: now,
    };

    if (!product.images) {
      product.images = [];
    }

    const existingImageIndex = product.images.findIndex(img => img.id === newImage.id);
    if (existingImageIndex !== -1) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        error: 'Image with this ID already exists',
      };
    }

    product.images.push(newImage);
    product.updatedAt = now;

    await updateProductInRepo(product);

    return {
      ok: true,
      data: newImage,
    };
  } catch (error: any) {
    if (error.message.includes('not authorized') || error.message.includes('Authentication required')) {
      return {
        ok: false,
        code: 'FORBIDDEN',
        error: error.message,
      };
    }

    throw error;
  }
}
