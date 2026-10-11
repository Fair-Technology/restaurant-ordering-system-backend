import { HttpRequest } from '@azure/functions';
import { getUserIdFromAuth } from '../../../infrastructure/auth/authHelpers';
import { findUserById } from '../../../infrastructure/cosmos/user/CosmosUserRepository';
import { findShopById, findShopBySlug, updateShop } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { logAudit } from '../../_shared/auditHelpers';
import { ApplicationResult } from '../../_shared/types';

/** Superadmin only. Brings a deleted shop back; billing is NOT restarted (the shop stays on the free plan). */
export async function executeRestoreShop(
  request: { shopId: string },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<{ success: boolean }>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required and must be a non-empty string' };
  }

  try {
    const userId = await getUserIdFromAuth(httpRequest);
    const user = await findUserById(userId);
    if (user?.systemRole !== 'superadmin') {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }

    const shop = await findShopById(request.shopId.trim());
    if (!shop) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    if (!shop.isDeleted) return { ok: false, code: 'CONFLICT', error: 'Shop is not deleted' };
    // A new shop may have taken this web address while the old one was deleted.
    const clash = shop.slug ? await findShopBySlug(shop.slug) : null;
    if (clash && clash.id !== shop.id) {
      return { ok: false, code: 'CONFLICT', error: `Another shop now uses the web address "${shop.slug}"` };
    }

    const { deletedAt: _deletedAt, deletedBy: _deletedBy, ...rest } = shop;
    await updateShop({ ...rest, isDeleted: false, updatedAt: new Date().toISOString() });

    await logAudit({
      shopId: shop.id,
      actorType: 'superadmin',
      actorId: userId,
      action: 'shop.restore',
      entityType: 'shop',
      entityId: shop.id,
      entityName: shop.name,
      changes: [{ field: 'isDeleted', from: true, to: false }],
    });

    return { ok: true, data: { success: true } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to restore shop' };
  }
}
