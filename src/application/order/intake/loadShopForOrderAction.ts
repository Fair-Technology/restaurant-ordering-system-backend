import type { HttpRequest } from '@azure/functions';
import type { Shop } from '../../../domain/shop/Shop';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction, ShopAccess, type ShopAccessOptions } from '../../_shared/shopAccess';
import type { ApplicationError } from '../../_shared/types';

/**
 * Whoever may see orders may act on them (owner, and manager/staff by role); superadmins may not act (a Platform.ReadOnly operator may only read, via `allowPlatformRead`).
 * Shared first step of every kitchen action.
 *
 * Deliberate (docs/endpoint-authorization.md): accept, reject, ready, dispatch, complete and
 * busy-mode are gated by `view_orders`. Taking an order IS the job of the plain staff role, whose
 * default is exactly `['view_orders']`; a separate write permission would either lock the kitchen
 * out or have to be granted to every role that has `view_orders` anyway. Money-moving actions
 * (refunds) do use their own `refund_orders`. The name is imprecise, the behaviour is intended.
 */
export async function loadShopForOrderAction(
  shopId: string,
  httpRequest: HttpRequest,
  options: ShopAccessOptions = {},
): Promise<({ ok: true; shop: Shop } & ShopAccess) | ApplicationError> {
  if (!shopId || typeof shopId !== 'string') return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  const shop = await findShopById(shopId);
  if (!shop || shop.isDeleted) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
  const access = await authorizeShopAction(httpRequest, shop, 'view_orders', options);
  if (!access.ok) return access;
  return { ...access, shop };
}
