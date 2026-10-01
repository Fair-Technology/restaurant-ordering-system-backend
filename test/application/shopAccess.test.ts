import { describe, it, expect } from 'vitest';
import { resolveShopAccess, ShopAccessDeps } from '../../src/application/_shared/shopAccess';
import { Shop } from '../../src/domain/shop/Shop';
import { Principal } from '../../src/infrastructure/auth/principal';
import { StaffAccount } from '../../src/domain/staff/StaffAccount';
import { DEFAULT_ROLE_PERMISSIONS } from '../../src/domain/system/RolePermissions';

const shop = {
  id: 'shop-1',
  members: [
    { userId: 'u-owner', role: 'owner', isActive: true },
    { userId: 'u-old', role: 'owner', isActive: false },
  ],
} as unknown as Shop;

function makeDeps(isSuperadmin: boolean, findStaff?: ShopAccessDeps['findStaff']): ShopAccessDeps {
  return {
    isSuperadmin: async () => isSuperadmin,
    rolePermissions: async () => ({ manager: [], staff: [] }),
    findStaff: findStaff ?? (async () => null),
  };
}

describe('resolveShopAccess', () => {
  it('owner gets everything', async () => {
    const principal: Principal = { kind: 'entra', userId: 'u-owner' };
    const access = await resolveShopAccess(principal, shop, makeDeps(false));
    expect(access?.actor).toEqual({ actorType: 'owner', actorId: 'u-owner', role: 'owner' });
    expect(access?.permissions).toHaveLength(6);
  });

  it('inactive owner is refused', async () => {
    const principal: Principal = { kind: 'entra', userId: 'u-old' };
    const access = await resolveShopAccess(principal, shop, makeDeps(false));
    expect(access).toBeNull();
  });

  it('stranger is refused', async () => {
    const principal: Principal = { kind: 'entra', userId: 'u-stranger' };
    const access = await resolveShopAccess(principal, shop, makeDeps(false));
    expect(access).toBeNull();
  });

  it('superadmin allowed when opted in', async () => {
    const principal: Principal = { kind: 'entra', userId: 'u-admin' };
    const access = await resolveShopAccess(principal, shop, makeDeps(true), { allowSuperadmin: true });
    expect(access?.actor.actorType).toBe('superadmin');
  });

  it('superadmin refused when not opted in', async () => {
    const principal: Principal = { kind: 'entra', userId: 'u-admin' };
    const access = await resolveShopAccess(principal, shop, makeDeps(true));
    expect(access).toBeNull();
  });
});

describe('resolveShopAccess (staff)', () => {
  const staffPrincipal: Principal = { kind: 'staff', staffId: 'st-1', shopId: 'shop-1', role: 'staff' };

  function makeStaffDeps(account: StaffAccount | null): ShopAccessDeps {
    return {
      isSuperadmin: async () => false,
      rolePermissions: async () => DEFAULT_ROLE_PERMISSIONS,
      findStaff: async () => account,
    };
  }

  const baseAccount: StaffAccount = {
    id: 'st-1',
    shopId: 'shop-1',
    username: 'kitchen',
    displayName: null,
    role: 'staff',
    passwordHash: 'x',
    isActive: true,
    isDeleted: false,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdBy: 'owner-1',
    createdAt: '2026-09-25T00:00:00.000Z',
    updatedAt: '2026-09-25T00:00:00.000Z',
  };

  it('database role wins', async () => {
    const access = await resolveShopAccess(
      staffPrincipal,
      shop,
      makeStaffDeps({ ...baseAccount, role: 'manager' }),
    );
    expect(access?.actor).toEqual({ actorType: 'staff', actorId: 'st-1', role: 'manager' });
    expect(access?.permissions).toEqual(['view_orders', 'manage_menu', 'manage_staff', 'view_audit']);
  });

  it('other restaurant refused', async () => {
    const otherShopPrincipal: Principal = { kind: 'staff', staffId: 'st-1', shopId: 'shop-2', role: 'staff' };
    const access = await resolveShopAccess(otherShopPrincipal, shop, makeStaffDeps(baseAccount));
    expect(access).toBeNull();
  });

  it('inactive refused', async () => {
    const access = await resolveShopAccess(staffPrincipal, shop, makeStaffDeps({ ...baseAccount, isActive: false }));
    expect(access).toBeNull();
  });

  it('deleted refused', async () => {
    const access = await resolveShopAccess(staffPrincipal, shop, makeStaffDeps({ ...baseAccount, isDeleted: true }));
    expect(access).toBeNull();
  });

  it('missing refused', async () => {
    const access = await resolveShopAccess(staffPrincipal, shop, makeStaffDeps(null));
    expect(access).toBeNull();
  });
});
