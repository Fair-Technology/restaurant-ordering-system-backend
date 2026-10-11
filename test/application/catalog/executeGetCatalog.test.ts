import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { executeGetCatalog } from '../../../src/application/category/getCatalog/executeGetCatalog';
import { CARD_SHOP } from '../../fixtures/orders';

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
});
