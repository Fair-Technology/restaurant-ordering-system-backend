import type { HttpRequest } from '@azure/functions';
import {
  busyStateOf,
  isBusyActive,
  serviceDateOf,
  type BusyMode,
  type BusyState,
} from '../../../domain/order/kitchenTiming';
import { BUSY_MODE_BODY_ERROR } from '../../../domain/order/orderErrors';
import { orderSettingsOf } from '../../../domain/order/orderSettings';
import { patchShopFields } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { logAudit } from '../../_shared/auditHelpers';
import { toAuditActor } from '../../_shared/shopAccess';
import type { ApplicationResult } from '../../_shared/types';
import { loadShopForOrderAction } from './loadShopForOrderAction';

/** The "Busy? Add N min" button: lasts until 04:00 restaurant time, or until switched off. */
export async function executeSetBusyMode(
  request: { shopId: string; on?: unknown },
  httpRequest: HttpRequest,
  options: { now?: Date } = {},
): Promise<ApplicationResult<BusyState>> {
  if (typeof request.on !== 'boolean') return { ok: false, code: 'INVALID_INPUT', error: BUSY_MODE_BODY_ERROR };
  try {
    const loaded = await loadShopForOrderAction(request.shopId, httpRequest);
    if (!loaded.ok) return loaded;
    const { shop, actor } = loaded;
    const now = options.now ?? new Date();
    const wasOn = isBusyActive(shop.busyMode, shop.timezone, now);
    if (wasOn === request.on) return { ok: true, data: busyStateOf(shop, now) };
    const busyMode: BusyMode | null = request.on
      ? {
          extraMinutes: orderSettingsOf(shop).busyExtraMinutes,
          serviceDate: serviceDateOf(now, shop.timezone),
          startedAt: now.toISOString(),
        }
      : null;
    await patchShopFields(shop.id, { busyMode, updatedAt: now.toISOString() });
    await logAudit({
      shopId: shop.id,
      ...toAuditActor(actor),
      action: 'shop.busy_mode',
      entityType: 'shop',
      entityId: shop.id,
      entityName: shop.name,
      changes: [{ field: 'busyMinutes', from: wasOn ? shop.busyMode!.extraMinutes : 0, to: busyMode?.extraMinutes ?? 0 }],
    });
    return { ok: true, data: busyStateOf({ ...shop, busyMode }, now) };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to change busy mode' };
  }
}
