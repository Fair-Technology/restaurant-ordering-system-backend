import type { HttpRequest } from '@azure/functions';
import {
  ORDERS_SCREEN_WRITE_SKIP_MS,
  ordersScreenDocId,
} from '../../../domain/order/ordersScreen';
import {
  findOrdersScreenDoc,
  upsertOrdersScreenDoc,
} from '../../../infrastructure/cosmos/usage/CosmosOrdersScreenRepository';
import type { ApplicationResult } from '../../_shared/types';
import { loadShopForOrderAction } from './loadShopForOrderAction';

export interface OrdersScreenHeartbeatDto {
  lastSeenAt: string;
}

/** An open orders board pings this every minute; auto-accept only runs while a ping is recent. Writes at most every 30 s. */
export async function executeOrdersScreenHeartbeat(
  request: { shopId: string },
  httpRequest: HttpRequest,
  options: { now?: Date } = {},
): Promise<ApplicationResult<OrdersScreenHeartbeatDto>> {
  try {
    const loaded = await loadShopForOrderAction(request.shopId, httpRequest);
    if (!loaded.ok) return loaded;
    const now = options.now ?? new Date();
    const current = await findOrdersScreenDoc(loaded.shop.id);
    if (current) {
      const age = now.getTime() - Date.parse(current.lastSeenAt);
      if (age >= 0 && age < ORDERS_SCREEN_WRITE_SKIP_MS) return { ok: true, data: { lastSeenAt: current.lastSeenAt } };
    }
    const lastSeenAt = now.toISOString();
    await upsertOrdersScreenDoc({
      id: ordersScreenDocId(loaded.shop.id),
      kind: 'orders_screen',
      shopId: loaded.shop.id,
      lastSeenAt,
    });
    return { ok: true, data: { lastSeenAt } };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to record the orders screen' };
  }
}
