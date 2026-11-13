import { HttpRequest } from '@azure/functions';
import { ALL_SHOP_PERMISSIONS, Shop, ShopPermission } from '../../domain/shop/Shop';
import { RolePermissionsDoc, permissionsForRole } from '../../domain/system/RolePermissions';
import { StaffAccount, StaffRole } from '../../domain/staff/StaffAccount';
import { Principal, authenticate } from '../../infrastructure/auth/principal';
import { logAuthFailure } from '../../infrastructure/auth/logAuthFailure';
import { isPlatformReaderPrincipal, isSuperAdminPrincipal } from '../../infrastructure/auth/superAdminAuthHelpers';
import { getRolePermissions } from '../../infrastructure/cosmos/system/CosmosRolePermissionsRepository';
import { findShopById } from '../../infrastructure/cosmos/shop/CosmosShopRepository';
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
  isSuperadmin(principal: Principal): Promise<boolean>;
  /** Any platform operator, including Platform.ReadOnly. Consulted only when a handler opts in with `allowPlatformRead`. */
  isPlatformReader(principal: Principal): Promise<boolean>;
  rolePermissions(): Promise<Pick<RolePermissionsDoc, 'manager' | 'staff'>>;
  findStaff(shopId: string, staffId: string): Promise<StaffAccount | null>;
}

export const realDeps: ShopAccessDeps = {
  isSuperadmin: isSuperAdminPrincipal,
  isPlatformReader: isPlatformReaderPrincipal,
  rolePermissions: getRolePermissions,
  findStaff: findStaffAccountById,
};

/**
 * - `allowSuperadmin`: write-level platform staff (Owner/Support) may act on the shop.
 * - `allowPlatformRead`: ALSO admit Platform.ReadOnly. Only for handlers that change nothing:
 *   a GET that writes (a sync, an audit entry) must not set it.
 */
export interface ShopAccessOptions {
  allowSuperadmin?: boolean;
  allowPlatformRead?: boolean;
}

async function platformOperatorMayAct(principal: Principal, deps: ShopAccessDeps, options: ShopAccessOptions) {
  if (options.allowSuperadmin && (await deps.isSuperadmin(principal))) return true;
  return !!options.allowPlatformRead && (await deps.isPlatformReader(principal));
}

export async function resolveShopAccess(
  principal: Principal,
  shop: Shop,
  deps: ShopAccessDeps,
  options: ShopAccessOptions = {},
): Promise<ShopAccess | null> {
  // A deleted shop is closed to everyone except a superadmin on an endpoint that allows one.
  if (shop.isDeleted) {
    if (principal.kind === 'entra' && (await platformOperatorMayAct(principal, deps, options))) {
      return {
        actor: { actorType: 'superadmin', actorId: principal.userId, role: null },
        permissions: [...ALL_SHOP_PERMISSIONS],
      };
    }
    return null;
  }
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
    if (await platformOperatorMayAct(principal, deps, options)) {
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
  options: ShopAccessOptions = {},
): Promise<({ ok: true } & ShopAccess) | ApplicationError> {
  let principal: Principal;
  try {
    principal = await authenticate(request);
  } catch (err) {
    logAuthFailure('authorizeShopAction', err);
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

/**
 * Read access to a shop's back-office data (categories, products): a member of that
 * shop (owner, or its own active staff) or a platform superadmin. Merely being signed in
 * is not enough: that would let any diner, or another shop's owner, read any shop.
 */
export async function authorizeShopRead(
  request: HttpRequest,
  shopId: string,
): Promise<({ ok: true; shop: Shop } & ShopAccess) | ApplicationError> {
  const shop = await findShopById(shopId);
  if (!shop) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
  const access = await authorizeShopAction(request, shop, null, { allowSuperadmin: true, allowPlatformRead: true });
  if (!access.ok) return access;
  return { ...access, shop };
}

export function toAuditActor(actor: ShopActor): Pick<AuditEntry, 'actorType' | 'actorId'> {
  return { actorType: actor.actorType, actorId: actor.actorId };
}
