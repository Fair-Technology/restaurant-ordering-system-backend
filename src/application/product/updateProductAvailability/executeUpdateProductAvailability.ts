import { HttpRequest } from '@azure/functions';
import {
  findProductById,
  updateProduct as updateProductInRepo,
} from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { diffFields, logAudit } from '../../_shared/auditHelpers';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import { ApplicationResult } from '../../_shared/types';
import { UpdateProductAvailabilityRequestDto, UpdateProductAvailabilityResultDto } from './dtos';

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

/**
 * Stock-only write path: switches a dish on or off (`isAvailable`), and nothing else.
 * Gated on `manage_stock` OR `manage_menu`, so a counter hand can turn a dish off without menu rights.
 * Any other key in the body (e.g. a retired field from an old client) is never read, so a stale client is not rejected.
 */
export async function executeUpdateProductAvailability(
  request: UpdateProductAvailabilityRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<UpdateProductAvailabilityResultDto>> {
  if (!nonEmpty(request.productId)) {
    return { ok: false, code: 'INVALID_INPUT', error: 'productId is required and must be a non-empty string' };
  }
  if (!nonEmpty(request.shopId)) {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required and must be a non-empty string' };
  }

  const setsFlag = Object.prototype.hasOwnProperty.call(request, 'isAvailable') && request.isAvailable !== undefined;

  if (!setsFlag) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'Send isAvailable',
    };
  }
  if (setsFlag && typeof request.isAvailable !== 'boolean') {
    return { ok: false, code: 'INVALID_INPUT', error: 'isAvailable must be true or false' };
  }

  try {
    const shopId = request.shopId.trim();
    const productId = request.productId.trim();

    const [product, shop] = await Promise.all([findProductById(productId, shopId), findShopById(shopId)]);
    if (!product || product.isDeleted) return { ok: false, code: 'NOT_FOUND', error: 'Product not found' };
    if (!shop) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };

    const access = await authorizeShopAction(httpRequest, shop, null);
    if (!access.ok) return access;
    if (!access.permissions.includes('manage_stock') && !access.permissions.includes('manage_menu')) {
      return {
        ok: false,
        code: 'FORBIDDEN',
        error: 'Insufficient permissions: manage_stock or manage_menu required',
      };
    }

    if (request.isAvailable === true && product.categoryIds.length === 0) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        error: 'A product must have at least one category before it can be made available.',
      };
    }

    const now = new Date();
    const updatedProduct = {
      ...product,
      ...(typeof request.isAvailable === 'boolean' && { isAvailable: request.isAvailable }),
      updatedAt: now.toISOString(),
    };

    const result = await updateProductInRepo(updatedProduct);

    const changes = diffFields(
      product as unknown as Record<string, unknown>,
      updatedProduct as unknown as Record<string, unknown>,
      ['isAvailable'],
      [],
    );
    await logAudit({
      shopId: result.shopId,
      ...toAuditActor(access.actor),
      action: 'product.availability',
      entityType: 'product',
      entityId: result.id,
      entityName: result.name,
      changes,
    });

    return {
      ok: true,
      data: {
        id: result.id,
        shopId: result.shopId,
        isAvailable: result.isAvailable,
        updatedAt: result.updatedAt,
      },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('updateProductAvailability', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update product availability' };
  }
}
