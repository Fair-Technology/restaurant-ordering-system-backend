import { HttpRequest } from '@azure/functions';
import { getUserIdFromAuth } from '../../../infrastructure/auth/authHelpers';
import { findUserById } from '../../../infrastructure/cosmos/user/CosmosUserRepository';
import { findShopById, updateShop } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { declineWaitingOrdersForShop } from '../../order/_shared/declineWaitingOrders';
import { logAudit } from '../../_shared/auditHelpers';
import { ApplicationResult } from '../../_shared/types';

const REASON_MAX_LENGTH = 500;

/**
 * Superadmin only. Takes a shop offline on behalf of the platform (or lifts that).
 * While set, the owner cannot switch the shop online. The owner's own isPaused is untouched.
 */
export async function executeSetShopOfflineBySuperadmin(
  request: { shopId: string; offline: boolean; reason?: string },
  httpRequest: HttpRequest,
  options: { now?: Date } = {},
): Promise<ApplicationResult<{ offlineBySuperadmin: boolean; offlineBySuperadminReason?: string }>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required and must be a non-empty string' };
  }
  if (typeof request.offline !== 'boolean') {
    return { ok: false, code: 'INVALID_INPUT', error: 'offline must be a boolean' };
  }
  if (request.reason !== undefined && typeof request.reason !== 'string') {
    return { ok: false, code: 'INVALID_INPUT', error: 'reason must be a string' };
  }
  const reason = request.reason?.trim() || undefined;
  if (reason && reason.length > REASON_MAX_LENGTH) {
    return { ok: false, code: 'INVALID_INPUT', error: `reason must be at most ${REASON_MAX_LENGTH} characters` };
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

    const { offlineBySuperadminReason: _oldReason, ...rest } = shop;
    const nextReason = request.offline ? reason : undefined;
    await updateShop({
      ...rest,
      offlineBySuperadmin: request.offline,
      ...(nextReason && { offlineBySuperadminReason: nextReason }),
      updatedAt: now.toISOString(),
    });

    await logAudit({
      shopId: shop.id,
      actorType: 'superadmin',
      actorId: userId,
      action: 'shop.offline_by_superadmin',
      entityType: 'shop',
      entityId: shop.id,
      entityName: shop.name,
      changes: [
        { field: 'offlineBySuperadmin', from: shop.offlineBySuperadmin === true, to: request.offline },
        ...(shop.offlineBySuperadminReason !== nextReason
          ? [{ field: 'offlineBySuperadminReason', from: shop.offlineBySuperadminReason ?? null, to: nextReason ?? null }]
          : []),
      ],
    });

    // Taking a shop down also declines what is still waiting for its answer (never throws).
    if (request.offline) {
      const declined = await declineWaitingOrdersForShop({ ...shop, offlineBySuperadmin: true }, now);
      if (declined > 0) console.log('[takedown] declined waiting orders', shop.id, declined);
    }

    return {
      ok: true,
      data: {
        offlineBySuperadmin: request.offline,
        ...(nextReason && { offlineBySuperadminReason: nextReason }),
      },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update shop' };
  }
}
