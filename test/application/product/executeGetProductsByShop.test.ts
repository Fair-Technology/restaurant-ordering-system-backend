import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({
  findProductsByShopId: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({
  findCategoriesByShopId: vi.fn(),
  findCategoryById: vi.fn(),
}));

import { findProductsByShopId } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import {
  findCategoriesByShopId,
  findCategoryById,
} from '../../../src/infrastructure/cosmos/category/CosmosCategoryRepository';
import { executeGetProductsByShop } from '../../../src/application/product/getProductsByShop/executeGetProductsByShop';

function product(id: string, categoryIds: string[]) {
  return {
    id,
    shopId: 'shop-1',
    name: id,
    description: 'x',
    price: 900,
    categoryIds,
    images: [],
    isAvailable: true,
    isDeleted: false,
    createdAt: 'x',
    updatedAt: 'x',
  };
}

const categories = [
  { id: 'c-pizza', shopId: 'shop-1', name: 'Pizza', sortOrder: 1, isDeleted: false },
  { id: 'c-pasta', shopId: 'shop-1', name: 'Pasta', sortOrder: 2, isDeleted: false, icon: 'bowl' },
];

describe('executeGetProductsByShop', () => {
  beforeEach(() => {
    vi.mocked(findProductsByShopId).mockReset().mockResolvedValue([
      product('p1', ['c-pasta', 'c-pizza']),
      product('p2', ['c-pizza']),
      product('p3', ['c-gone']),
      product('p4', []),
    ] as any);
    vi.mocked(findCategoriesByShopId).mockReset().mockResolvedValue(categories as any);
    vi.mocked(findCategoryById).mockReset();
  });

  // The admin's product list waits on this endpoint after every save; one
  // database read per product category made it take seconds, so the list sat
  // stale on screen long after the "saved" toast.
  it("reads the shop's categories in one query, not one read per product category", async () => {
    await executeGetProductsByShop({ shopId: 'shop-1' }, { includeUncategorized: true });

    expect(findCategoriesByShopId).toHaveBeenCalledTimes(1);
    expect(findCategoriesByShopId).toHaveBeenCalledWith('shop-1');
    expect(findCategoryById).not.toHaveBeenCalled();
  });

  it('attaches categories sorted by sortOrder and drops ones that no longer exist', async () => {
    const result = await executeGetProductsByShop({ shopId: 'shop-1' }, { includeUncategorized: true });

    expect(result.ok).toBe(true);
    const byId = Object.fromEntries((result as any).data.map((p: any) => [p.id, p.categories]));
    expect(byId.p1).toEqual([
      { id: 'c-pizza', name: 'Pizza', sortOrder: 1, icon: undefined },
      { id: 'c-pasta', name: 'Pasta', sortOrder: 2, icon: 'bowl' },
    ]);
    expect(byId.p2.map((c: any) => c.id)).toEqual(['c-pizza']);
    expect(byId.p3).toEqual([]);
    expect(byId.p4).toEqual([]);
  });

  it('leaves out products with no live category unless asked to include them', async () => {
    const result = await executeGetProductsByShop({ shopId: 'shop-1' });

    expect((result as any).data.map((p: any) => p.id)).toEqual(['p1', 'p2']);
  });
});
