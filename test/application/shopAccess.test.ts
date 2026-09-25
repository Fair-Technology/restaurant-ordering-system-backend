import { describe, it, expect } from 'vitest';
import { resolveShopAccess, ShopAccessDeps } from '../../src/application/_shared/shopAccess';
import { Shop } from '../../src/domain/shop/Shop';
import { Principal } from '../../src/infrastructure/auth/principal';

const shop = {
  id: 'shop-1',
  members: [
    { userId: 'u-owner', role: 'owner', isActive: true },
    { userId: 'u-old', role: 'owner', isActive: false },
  ],
} as unknown as Shop;

function makeDeps(isSuperadmin: boolean): ShopAccessDeps {
  return {
    isSuperadmin: async () => isSuperadmin,
    rolePermissions: async () => ({ manager: [], staff: [] }),
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
