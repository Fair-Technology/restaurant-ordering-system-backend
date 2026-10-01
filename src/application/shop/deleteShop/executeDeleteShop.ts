import { HttpRequest } from '@azure/functions';
import {
  findShopById,
  updateShop,
} from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction } from '../../_shared/shopAccess';
import { DeleteShopRequestDto, DeleteShopResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';

export async function executeDeleteShop(
  request: DeleteShopRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<DeleteShopResultDto>> {
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
    const shop = await findShopById(request.shopId.trim());

    if (!shop) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        error: 'Shop not found',
      };
    }

    const access = await authorizeShopAction(httpRequest, shop, 'manage_shop');
    if (!access.ok) return access;

    // Soft delete by setting isDeleted flag
    const deletedShop = {
      ...shop,
      isDeleted: true,
      updatedAt: new Date().toISOString(),
    };

    await updateShop(deletedShop);

    return {
      ok: true,
      data: { success: true },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to delete shop',
    };
  }
}
