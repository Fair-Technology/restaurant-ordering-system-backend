import { Shop, ShopPermission } from '../../domain/shop/Shop';
import { ApplicationError } from './types';

export type { ShopPermission };

/**
 * Check whether a user has a specific permission on a shop.
 *
 * - 'owner' role always passes (full access).
 * - Custom per-shop role definitions are gone; only 'owner' members exist on
 *   Shop.members, so any other/no member is denied. Fixed roles (manager/staff)
 *   with a global permission matrix land in step 22, which replaces this function.
 * - Returns null if access is granted, or an ApplicationError if denied.
 */
export function checkShopPermission(
  shop: Shop,
  userId: string,
  permission: ShopPermission,
): ApplicationError | null {
  const member = shop.members.find((m) => m.userId === userId && m.isActive);

  if (!member) {
    return { ok: false, code: 'FORBIDDEN', error: 'User is not a member of this shop' };
  }

  if (member.role === 'owner') {
    return null; // owners have full access
  }

  return { ok: false, code: 'FORBIDDEN', error: 'Insufficient permissions' };
}

/**
 * Check whether a user is an owner of the shop.
 * Returns null if they are, or an ApplicationError if not.
 */
export function checkIsOwner(shop: Shop, userId: string): ApplicationError | null {
  const member = shop.members.find(
    (m) => m.userId === userId && m.isActive && m.role === 'owner',
  );

  if (!member) {
    return { ok: false, code: 'FORBIDDEN', error: 'Only shop owners can perform this action' };
  }

  return null;
}

