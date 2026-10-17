import { HttpRequest } from '@azure/functions';
import { MAX_MISSED_ORDERS_PAUSE_LIMIT, missedOrdersPauseLimitOf } from '../../../domain/shop/ordersPause';
import { getUserIdFromAuth } from '../../../infrastructure/auth/authHelpers';
import { findShopById, patchShopFields } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { findUserById } from '../../../infrastructure/cosmos/user/CosmosUserRepository';
import { logAudit } from '../../_shared/auditHelpers';
import { ApplicationResult } from '../../_shared/types';

/**
 * Superadmin only. Sets how many unanswered orders in a row pause a shop automatically (0 = off, 1-10).
 * Saved with a patch, so it never overwrites the owner's other settings.
 */
export async function executeSetMissedOrdersPauseLimit(
  request: { shopId: string; limit: unknown },
  httpRequest: HttpRequest,
  options: { now?: Date } = {},
): Promise<ApplicationResult<{ missedOrdersPauseLimit: number }>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required and must be a non-empty string' };
  }
  const limit = request.limit;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 0 || limit > MAX_MISSED_ORDERS_PAUSE_LIMIT) {
    return { ok: false, code: 'INVALID_INPUT', error: 'limit must be a whole number from 0 (off) to 10' };
  }

  const now = options.now ?? new Date();
  try {
    const userId = await getUserIdFromAuth(httpRequest);
    const user = await findUserById(userId);
    if (user?.systemRole !== 'superadmin') {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }

    const shop = await findShopById(request.shopId.trim());
    if (!shop) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };

    await patchShopFields(shop.id, { missedOrdersPauseLimit: limit, updatedAt: now.toISOString() });

    await logAudit({
      shopId: shop.id,
      actorType: 'superadmin',
      actorId: userId,
      action: 'shop.missed_orders_pause_limit',
      entityType: 'shop',
      entityId: shop.id,
      entityName: shop.name,
      changes: [{ field: 'missedOrdersPauseLimit', from: missedOrdersPauseLimitOf(shop), to: limit }],
    });

    return { ok: true, data: { missedOrdersPauseLimit: limit } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update shop' };
  }
}
