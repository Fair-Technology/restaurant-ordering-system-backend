import { HttpRequest } from '@azure/functions';
import {
  countOrdersByShopId,
  findOrdersByShopIdPaginated,
} from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { toOrderDto } from '../_shared/toOrderDto';
import { authorizeShopAction } from '../../_shared/shopAccess';
import {
  GetOrdersByShopRequestDto,
  GetOrdersByShopResultDto,
  OrderDto,
} from './dtos';
import { ApplicationResult } from '../../_shared/types';

export async function executeGetOrdersByShop(
  request: GetOrdersByShopRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetOrdersByShopResultDto>> {
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

  const page = request.page ?? 1;
  const pageSize = request.pageSize ?? 20;

  if (!Number.isInteger(page) || page < 1) {
    return { ok: false, code: 'INVALID_INPUT', error: 'page must be a positive integer' };
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    return { ok: false, code: 'INVALID_INPUT', error: 'pageSize must be a positive integer no greater than 100' };
  }

  try {
    const shopId = request.shopId.trim();

    const shop = await findShopById(shopId);
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const access = await authorizeShopAction(httpRequest, shop, 'view_orders', { allowSuperadmin: true });
    if (!access.ok) return access;

    const [orders, total] = await Promise.all([
      findOrdersByShopIdPaginated(shopId, page, pageSize),
      countOrdersByShopId(shopId),
    ]);

    const now = new Date();
    const orderDtos: OrderDto[] = orders.map((order) => toOrderDto(order, now));

    return {
      ok: true,
      data: { orders: orderDtos, total, page, pageSize },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to retrieve orders',
    };
  }
}
