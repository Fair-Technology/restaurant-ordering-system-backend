import type { HttpRequest } from '@azure/functions';
import type { Shop } from '../../../domain/shop/Shop';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction, ShopAccess } from '../../_shared/shopAccess';
import type { ApplicationError } from '../../_shared/types';

/**
 * Whoever may see orders may act on them (owner, and manager/staff by role); superadmins may not.
 * Shared first step of every kitchen action.
 */
export async function loadShopForOrderAction(
  shopId: string,
  httpRequest: HttpRequest,
): Promise<({ ok: true; shop: Shop } & ShopAccess) | ApplicationError> {
  if (!shopId || typeof shopId !== 'string') return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  const shop = await findShopById(shopId);
  if (!shop || shop.isDeleted) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
  const access = await authorizeShopAction(httpRequest, shop, 'view_orders');
  if (!access.ok) return access;
  return { ...access, shop };
}
