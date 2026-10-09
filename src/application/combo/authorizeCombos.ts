import type { HttpRequest } from '@azure/functions';
import type { Shop } from '../../domain/shop/Shop';
import { findShopById } from '../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction, toAuditActor } from '../_shared/shopAccess';
import type { ApplicationError } from '../_shared/types';

/** The restaurant, and the caller if they may edit its menu (owners always, managers by default). */
export async function authorizeCombos(
  shopId: unknown,
  httpRequest: HttpRequest,
): Promise<{ ok: true; shop: Shop; audit: ReturnType<typeof toAuditActor> } | ApplicationError> {
  if (!shopId || typeof shopId !== 'string') return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  const shop = await findShopById(shopId);
  if (!shop || shop.isDeleted) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
  const access = await authorizeShopAction(httpRequest, shop, 'manage_menu');
  if (!access.ok) return access;
  return { ok: true, shop, audit: toAuditActor(access.actor) };
}
