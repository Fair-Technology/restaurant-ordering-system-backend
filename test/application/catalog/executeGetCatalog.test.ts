import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository', () => ({ findShopOptionGroupsByShopId: vi.fn(async () => []) }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({
  findCategoriesByShopId: vi.fn(async () => []),
}));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({
  findProductsByShopId: vi.fn(async () => []),
}));
vi.mock('../../../src/infrastructure/cosmos/system/CosmosSystemConfigRepository', () => ({
  getSystemConfig: vi.fn(async () => ({ id: 'global', maxShopsDefault: 3, emailEnabled: false, scheduleHorizonDays: 4 })),
}));
vi.mock('../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository', async () => ({
  getReferenceLists: vi.fn(async () => (await import('../../../src/domain/reference/ReferenceLists')).DE_REFERENCE_LISTS),
}));

import { findCategoriesByShopId } from '../../../src/infrastructure/cosmos/category/CosmosCategoryRepository';
import { findProductsByShopId } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { findShopOptionGroupsByShopId } from '../../../src/infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { getSystemConfig } from '../../../src/infrastructure/cosmos/system/CosmosSystemConfigRepository';
import { buildCatalog } from '../../../src/application/category/getCatalog/buildCatalog';
import { DE_REFERENCE_LISTS } from '../../../src/domain/reference/ReferenceLists';
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

describe('executeGetCatalog at', () => {
  const NOW = new Date('2026-10-05T10:00:00Z');
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    (findCategoriesByShopId as any).mockResolvedValue(CATEGORIES);
    (findProductsByShopId as any).mockResolvedValue([P_COLA]);
    (findShopOptionGroupsByShopId as any).mockResolvedValue([]);
    (getSystemConfig as any).mockResolvedValue({ scheduleHorizonDays: 4 });
  });
  afterEach(() => vi.useRealTimers());

  it('without at the result equals buildCatalog with no at, and the horizon is not read', async () => {
    const res = await executeGetCatalog({ shopId: 'shop-1' });
    expect(res).toEqual({
      ok: true,
      data: buildCatalog({ shop: CARD_SHOP, categories: CATEGORIES, products: [P_COLA], refs: DE_REFERENCE_LISTS, lang: undefined, now: NOW }),
    });
    expect(getSystemConfig).not.toHaveBeenCalled();
  });

  it('accepts a moment in the future inside the horizon', async () => {
    expect((await executeGetCatalog({ shopId: 'shop-1', at: '2026-10-06T16:00:00.000Z' })).ok).toBe(true);
  });

  it.each([
    ['in the past', '2026-10-05T09:00:00.000Z', 'at must be in the future'],
    ['now', '2026-10-05T10:00:00.000Z', 'at must be in the future'],
    ['beyond the horizon', '2026-10-10T07:00:00.000Z', 'at is beyond the booking horizon'],
    ['off a quarter hour', '2026-10-06T16:10:00.000Z', 'at must be an ISO instant on a quarter hour'],
    ['not an instant', 'tomorrow', 'at must be an ISO instant on a quarter hour'],
  ])('refuses at %s', async (_l, at, error) => {
    expect(await executeGetCatalog({ shopId: 'shop-1', at })).toEqual({ ok: false, code: 'INVALID_INPUT', error });
  });

  it('follows the configured horizon', async () => {
    (getSystemConfig as any).mockResolvedValue({ scheduleHorizonDays: 1 });
    expect(await executeGetCatalog({ shopId: 'shop-1', at: '2026-10-07T10:00:00.000Z' })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    (getSystemConfig as any).mockResolvedValue({ scheduleHorizonDays: 6 });
    expect((await executeGetCatalog({ shopId: 'shop-1', at: '2026-10-10T10:00:00.000Z' })).ok).toBe(true);
  });
});
