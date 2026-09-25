import { HttpRequest } from '@azure/functions';
import { ALL_SHOP_PERMISSIONS, Shop, ShopPermission } from '../../domain/shop/Shop';
import { RolePermissionsDoc } from '../../domain/system/RolePermissions';
import { Principal, authenticate } from '../../infrastructure/auth/principal';
import { findUserById } from '../../infrastructure/cosmos/user/CosmosUserRepository';
import { getRolePermissions } from '../../infrastructure/cosmos/system/CosmosRolePermissionsRepository';
import { AuditEntry } from '../../domain/audit/AuditEntry';
import { ApplicationError } from './types';

// The 'staff' actor type (`{ actorType: 'staff'; actorId: string; role: StaffRole }`)
// is added in step 25, once StaffAccount/StaffRole exist.
export type ShopActor =
  | { actorType: 'owner'; actorId: string; role: 'owner' }
  | { actorType: 'superadmin'; actorId: string; role: null };

export interface ShopAccess {
  actor: ShopActor;
  permissions: ShopPermission[];
}

export interface ShopAccessDeps {
  isSuperadmin(userId: string): Promise<boolean>;
  rolePermissions(): Promise<Pick<RolePermissionsDoc, 'manager' | 'staff'>>;
  // findStaff(shopId: string, staffId: string): Promise<StaffAccount | null>;   // added in step 25
}

export const realDeps: ShopAccessDeps = {
  isSuperadmin: async (userId) => (await findUserById(userId))?.systemRole === 'superadmin',
  rolePermissions: getRolePermissions,
};

export async function resolveShopAccess(
  principal: Principal,
  shop: Shop,
  deps: ShopAccessDeps,
  options: { allowSuperadmin?: boolean } = {},
): Promise<ShopAccess | null> {
  if (principal.kind === 'entra') {
    const isOwner = shop.members.some(
      (m) => m.userId === principal.userId && m.role === 'owner' && m.isActive,
    );
    if (isOwner) {
      return {
        actor: { actorType: 'owner', actorId: principal.userId, role: 'owner' },
        permissions: [...ALL_SHOP_PERMISSIONS],
      };
    }
    if (options.allowSuperadmin && (await deps.isSuperadmin(principal.userId))) {
      return {
        actor: { actorType: 'superadmin', actorId: principal.userId, role: null },
        permissions: [...ALL_SHOP_PERMISSIONS],
      };
    }
    return null;
  }
  return null; // staff branch added in step 25
}

export async function authorizeShopAction(
  request: HttpRequest,
  shop: Shop,
  permission: ShopPermission | null,
  options: { allowSuperadmin?: boolean } = {},
): Promise<({ ok: true } & ShopAccess) | ApplicationError> {
  let principal: Principal;
  try {
    principal = await authenticate(request);
  } catch {
    return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
  }

  const access = await resolveShopAccess(principal, shop, realDeps, options);
  if (!access) {
    return { ok: false, code: 'FORBIDDEN', error: 'You do not have access to this restaurant' };
  }
  if (permission && !access.permissions.includes(permission)) {
    return { ok: false, code: 'FORBIDDEN', error: 'Insufficient permissions' };
  }
  return { ok: true, ...access };
}

export function toAuditActor(actor: ShopActor): Pick<AuditEntry, 'actorType' | 'actorId'> {
  return { actorType: actor.actorType, actorId: actor.actorId };
}
