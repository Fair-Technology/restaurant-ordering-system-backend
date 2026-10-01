import { HttpRequest } from '@azure/functions';
import {
  countOrdersByShopId,
  findOrdersByShopIdPaginated,
} from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { deriveDisplayState } from '../../../domain/order/orderLifecycle';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
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

    const orderDtos: OrderDto[] = orders.map((order) => ({
      id: order.id,
      orderRef: order.orderRef,
      state: order.state,
      displayState: deriveDisplayState(order, new Date()),
      fulfilmentMode: order.fulfilmentMode,
      paymentMethod: order.payment.method,
      paymentStatus: order.payment.status,
      readyAt: order.readyAt ?? null,
      items: order.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        selectedVariantOptionId: item.selectedVariantOptionId,
        selectedVariantOptionName: item.selectedVariantOptionName,
        selectedAddonOptionIds: item.selectedAddonOptionIds,
        selectedAddonOptionNames: item.selectedAddonOptionNames,
        lineTotalCents: item.lineTotalCents,
      })),
      subtotalCents: order.subtotalCents,
      currency: order.currency,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      customerNotes: order.customerNotes,
      history: order.history,
      createdAt: order.createdAt,
    }));

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
