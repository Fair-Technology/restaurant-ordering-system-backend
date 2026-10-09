import type { HttpRequest } from '@azure/functions';
import type { Shop } from '../../domain/shop/Shop';
import { findShopById } from '../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction, toAuditActor, type ShopActor } from '../_shared/shopAccess';
import type { ApplicationError } from '../_shared/types';

/** The restaurant, and the caller if they may manage it (owners always, staff only with "manage shop"). */
export async function authorizePromotions(
  shopId: unknown,
  httpRequest: HttpRequest,
): Promise<{ ok: true; shop: Shop; actor: ShopActor; audit: ReturnType<typeof toAuditActor> } | ApplicationError> {
  if (!shopId || typeof shopId !== 'string') return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  const shop = await findShopById(shopId);
  if (!shop || shop.isDeleted) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
  const access = await authorizeShopAction(httpRequest, shop, 'manage_shop');
  if (!access.ok) return access;
  return { ok: true, shop, actor: access.actor, audit: toAuditActor(access.actor) };
}
