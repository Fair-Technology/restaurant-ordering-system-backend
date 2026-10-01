import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (a: any) => ({ actorType: a.actorType, actorId: a.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({
  findCategoriesByShopId: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({
  findProductsByShopId: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({ findOrdersByShopId: vi.fn() }));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn() }));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { findCategoriesByShopId } from '../../../src/infrastructure/cosmos/category/CosmosCategoryRepository';
import { findProductsByShopId } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { findOrdersByShopId } from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { executeExportShopData } from '../../../src/application/legal/exportShopData/executeExportShopData';

const o1 = {
  id: 'o1', state: 'COMPLETED', customerName: 'Anna A', customerEmail: 'Anna@Example.com', customerPhone: '111',
  customerNotes: 'no nuts', createdAt: '2026-10-01T10:00:00Z', _etag: 'x',
};
const o2 = {
  id: 'o2', state: 'COMPLETED', customerName: 'Anna B', customerEmail: 'anna@example.com', customerPhone: '222',
  createdAt: '2026-10-02T10:00:00Z',
};
const o3 = {
  id: 'o3', state: 'COMPLETED', customerName: 'Deleted customer', customerEmail: '', customerPhone: '',
  anonymisedAt: '2026-10-03T00:00:00Z', createdAt: '2026-09-30T10:00:00Z',
};

describe('executeExportShopData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue({
      ok: true,
      actor: { actorType: 'owner', actorId: 'u1', role: 'owner' },
      permissions: [],
    });
    (findShopById as any).mockResolvedValue({
      id: 'shop-1', slug: 'p', name: 'Pizzeria', countryCode: 'DE', currency: 'EUR', timezone: 'Europe/Berlin',
      address: {}, openingHours: {}, isDeleted: false, members: [],
    });
    (findCategoriesByShopId as any).mockResolvedValue([
      { id: 'c1', isDeleted: false },
      { id: 'c2', isDeleted: true },
    ]);
    (findProductsByShopId as any).mockResolvedValue([]);
    (findOrdersByShopId as any).mockResolvedValue([o2, o1, o3]);
  });

  it('owner export omits order notes', async () => {
    const r: any = await executeExportShopData({ shopId: 'shop-1' }, {} as any);
    expect(r.data.orders).toHaveLength(3);
    for (const o of r.data.orders) {
      expect('customerNotes' in o).toBe(false);
      expect('_etag' in o).toBe(false);
    }
    expect(r.data.categories.map((c: any) => c.id)).toEqual(['c1']);
  });

  it('a staff manager is refused', async () => {
    (authorizeShopAction as any).mockResolvedValue({
      ok: true,
      actor: { actorType: 'staff', actorId: 's1', role: 'manager' },
      permissions: [],
    });
    expect(await executeExportShopData({ shopId: 'shop-1' }, {} as any)).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      error: 'Only the restaurant owner can do this',
    });
  });

  it('customers are deduplicated by email, anonymised orders skipped', async () => {
    const r: any = await executeExportShopData({ shopId: 'shop-1' }, {} as any);
    expect(r.data.customers).toEqual([
      {
        name: 'Anna B', email: 'anna@example.com', phone: '222', orderCount: 2,
        firstOrderAt: '2026-10-01T10:00:00Z', lastOrderAt: '2026-10-02T10:00:00Z',
      },
    ]);
  });
});
