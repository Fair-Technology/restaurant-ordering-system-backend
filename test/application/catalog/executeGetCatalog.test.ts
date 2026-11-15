import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository', () => ({ findShopOptionGroupsByShopId: vi.fn(async () => []) }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({
  findCategoriesByShopId: vi.fn(async () => []),
}));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({
  findProductsByShopId: vi.fn(async () => []),
}));
vi.mock('../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository', async () => ({
  getReferenceLists: vi.fn(async () => (await import('../../../src/domain/reference/ReferenceLists')).DE_REFERENCE_LISTS),
}));

import { findCategoriesByShopId } from '../../../src/infrastructure/cosmos/category/CosmosCategoryRepository';
import { findProductsByShopId } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { findShopOptionGroupsByShopId } from '../../../src/infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { executeGetCatalog } from '../../../src/application/category/getCatalog/executeGetCatalog';
import { CARD_SHOP, CATEGORIES, P_COLA } from '../../fixtures/orders';

describe('executeGetCatalog offline vs paused', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the menu while only orders are paused', async () => {
    (findShopById as any).mockResolvedValue({ ...CARD_SHOP, ordersPaused: true });
    expect((await executeGetCatalog({ shopId: 'shop-1' })).ok).toBe(true);
  });

  it('refuses when the owner is offline', async () => {
    (findShopById as any).mockResolvedValue({ ...CARD_SHOP, isPaused: true });
    expect(await executeGetCatalog({ shopId: 'shop-1' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('refuses when the platform took the shop offline', async () => {
    (findShopById as any).mockResolvedValue({ ...CARD_SHOP, offlineBySuperadmin: true });
    expect(await executeGetCatalog({ shopId: 'shop-1' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('shows a referenced library group on the dish, with its availability', async () => {
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    (findCategoriesByShopId as any).mockResolvedValue(CATEGORIES);
    (findProductsByShopId as any).mockResolvedValue([{ ...P_COLA, optionGroupRefs: ['g1'] }]);
    (findShopOptionGroupsByShopId as any).mockResolvedValue([
      {
        id: 'g1', shopId: 'shop-1', kind: 'addon', name: 'Sauces', minSelectable: 0, maxSelectable: 1, isDeleted: false,
        createdAt: 'x', updatedAt: 'x',
        options: [{ id: 'mayo', name: 'Mayo', priceDelta: 50, isAvailable: false }],
      },
    ]);
    const res = await executeGetCatalog({ shopId: 'shop-1' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const dish = JSON.stringify(res.data);
    expect(dish).toContain('"Sauces"');
    expect(dish).toContain('"Mayo"');
  });
});
