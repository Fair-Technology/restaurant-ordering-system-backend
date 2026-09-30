import { HttpRequest } from '@azure/functions';
import { ALL_SHOP_PERMISSIONS, Shop, ShopPermission } from '../../domain/shop/Shop';
import { RolePermissionsDoc, permissionsForRole } from '../../domain/system/RolePermissions';
import { StaffAccount, StaffRole } from '../../domain/staff/StaffAccount';
import { Principal, authenticate } from '../../infrastructure/auth/principal';
import { findUserById } from '../../infrastructure/cosmos/user/CosmosUserRepository';
import { getRolePermissions } from '../../infrastructure/cosmos/system/CosmosRolePermissionsRepository';
import { findStaffAccountById } from '../../infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { AuditEntry } from '../../domain/audit/AuditEntry';
import { ApplicationError } from './types';

export type ShopActor =
  | { actorType: 'owner'; actorId: string; role: 'owner' }
  | { actorType: 'staff'; actorId: string; role: StaffRole }
  | { actorType: 'superadmin'; actorId: string; role: null };

export interface ShopAccess {
  actor: ShopActor;
  permissions: ShopPermission[];
}

export interface ShopAccessDeps {
  isSuperadmin(userId: string): Promise<boolean>;
  rolePermissions(): Promise<Pick<RolePermissionsDoc, 'manager' | 'staff'>>;
  findStaff(shopId: string, staffId: string): Promise<StaffAccount | null>;
}

export const realDeps: ShopAccessDeps = {
  isSuperadmin: async (userId) => (await findUserById(userId))?.systemRole === 'superadmin',
  rolePermissions: getRolePermissions,
  findStaff: findStaffAccountById,
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

  // Staff: the role is re-read from the database on every request (not
  // trusted from the token), so a deactivation or role change takes effect
  // immediately instead of waiting for the token to expire. The staff
  // account and the role-permissions doc are independent reads, so fetch
  // both at once rather than one after the other.
  if (principal.shopId !== shop.id) return null;
  const [acc, doc] = await Promise.all([deps.findStaff(shop.id, principal.staffId), deps.rolePermissions()]);
  if (!acc || !acc.isActive || acc.isDeleted || acc.shopId !== shop.id) return null;
  return {
    actor: { actorType: 'staff', actorId: acc.id, role: acc.role },
    permissions: permissionsForRole(acc.role, doc),
  };
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
