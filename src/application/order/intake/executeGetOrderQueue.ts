import type { HttpRequest } from '@azure/functions';
import { DEFAULT_PREP_MINUTES } from '../../../domain/order/Order';
import { findOrdersByShopIdAndStates } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import type { ApplicationResult } from '../../_shared/types';
import { toOrderDto } from '../_shared/toOrderDto';
import type { OrderQueueDto } from './dtos';
import { loadShopForOrderAction } from './loadShopForOrderAction';

/** The kitchen board: every order still in play, oldest first. */
export async function executeGetOrderQueue(
  request: { shopId: string },
  httpRequest: HttpRequest,
  options: { now?: Date } = {},
): Promise<ApplicationResult<OrderQueueDto>> {
  try {
    const loaded = await loadShopForOrderAction(request.shopId, httpRequest);
    if (!loaded.ok) return loaded;
    const now = options.now ?? new Date();
    const orders = await findOrdersByShopIdAndStates(loaded.shop.id, ['PLACED', 'ACCEPTED', 'READY']);
    return {
      ok: true,
      data: {
        serverTime: now.toISOString(),
        timezone: loaded.shop.timezone,
        defaultPrepMinutes: { ...DEFAULT_PREP_MINUTES },
        orders: orders.map((o) => toOrderDto(o, now)),
      },
    };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve orders' };
  }
}
