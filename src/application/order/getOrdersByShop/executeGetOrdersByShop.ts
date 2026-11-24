import { HttpRequest } from '@azure/functions';
import {
  countOrdersByShopId,
  countOrdersByShopIdByState,
  findOrdersByShopIdPaginated,
} from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { toOrderDto, toSuperadminOrderDto } from '../_shared/toOrderDto';
import { authorizeShopAction } from '../../_shared/shopAccess';
import {
  GetOrdersByShopRequestDto,
  GetOrdersByShopResultDto,
  OrderDto,
} from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { logServiceFailure } from '../../_shared/logServiceFailure';

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Blank/undefined => absent (null result, valid). Otherwise a strict ISO-8601 date-time normalised to UTC, or 'invalid'. */
function normaliseInstant(value: string | undefined): string | undefined | 'invalid' {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const trimmed = String(value).trim();
  if (!ISO_INSTANT.test(trimmed)) return 'invalid';
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? 'invalid' : date.toISOString();
}

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

  const fromIso = normaliseInstant(request.from);
  if (fromIso === 'invalid') {
    return { ok: false, code: 'INVALID_INPUT', error: 'from must be an ISO-8601 UTC instant' };
  }
  const toIso = normaliseInstant(request.to);
  if (toIso === 'invalid') {
    return { ok: false, code: 'INVALID_INPUT', error: 'to must be an ISO-8601 UTC instant' };
  }

  try {
    const shopId = request.shopId.trim();

    const shop = await findShopById(shopId);
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const access = await authorizeShopAction(httpRequest, shop, 'view_orders', { allowSuperadmin: true, allowPlatformRead: true });
    if (!access.ok) return access;

    const [orders, total, stateCounts] = await Promise.all([
      findOrdersByShopIdPaginated(shopId, page, pageSize, fromIso, toIso),
      countOrdersByShopId(shopId, fromIso, toIso),
      countOrdersByShopIdByState(shopId, fromIso, toIso),
    ]);

    const now = new Date();
    const orderDtos: OrderDto[] = orders.map((order) =>
      access.actor.actorType === 'superadmin' ? toSuperadminOrderDto(order, now) : toOrderDto(order, now),
    );

    return {
      ok: true,
      data: { orders: orderDtos, total, stateCounts, page, pageSize },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('getOrdersByShop', error);
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to retrieve orders',
    };
  }
}
