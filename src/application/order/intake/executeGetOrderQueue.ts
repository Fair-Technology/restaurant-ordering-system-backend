import type { HttpRequest } from '@azure/functions';
import { busyStateOf, effectivePrepByMode } from '../../../domain/order/kitchenTiming';
import { isOpenAtSlot, isUpcoming } from '../../../domain/order/scheduling';
import { slotCapacityOf } from '../../../domain/order/slotCapacity';
import { findOrdersByShopIdAndStates } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import type { ApplicationResult } from '../../_shared/types';
import { loadSlotsTaken } from '../_shared/slotPlaces';
import { toOrderDto } from '../_shared/toOrderDto';
import type { OrderQueueDto } from './dtos';
import { loadShopForOrderAction } from './loadShopForOrderAction';

/** The kitchen board: every order still in play, oldest first, with booked orders not yet due listed apart. */
export async function executeGetOrderQueue(
  request: { shopId: string },
  httpRequest: HttpRequest,
  options: { now?: Date } = {},
): Promise<ApplicationResult<OrderQueueDto>> {
  try {
    const loaded = await loadShopForOrderAction(request.shopId, httpRequest);
    if (!loaded.ok) return loaded;
    const now = options.now ?? new Date();
    const all = await findOrdersByShopIdAndStates(loaded.shop.id, ['PLACED', 'ACCEPTED', 'READY', 'OUT_FOR_DELIVERY']);
    const live = all.filter((o) => !isUpcoming(o, loaded.shop, now));
    const upcoming = all
      .filter((o) => isUpcoming(o, loaded.shop, now))
      .sort((a, b) => Date.parse(a.scheduledFor!) - Date.parse(b.scheduledFor!));
    const cap = slotCapacityOf(loaded.shop);
    const capacity =
      cap === null ? null : { perSlot: cap, taken: await loadSlotsTaken(loaded.shop, upcoming.map((o) => o.scheduledFor!), now) };
    return {
      ok: true,
      data: {
        serverTime: now.toISOString(),
        timezone: loaded.shop.timezone,
        defaultPrepMinutes: effectivePrepByMode(loaded.shop, now),
        busy: busyStateOf(loaded.shop, now),
        orders: live.map((o) => toOrderDto(o, now)),
        upcoming: upcoming.map((o) => ({
          ...toOrderDto(o, now),
          outsideHours: !isOpenAtSlot(loaded.shop, o.fulfilmentMode, new Date(o.scheduledFor!)),
        })),
        capacity,
      },
    };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve orders' };
  }
}
