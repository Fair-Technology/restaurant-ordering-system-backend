import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (actor: any) => ({ actorType: actor.actorType, actorId: actor.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(async () => ({ id: 'shop-1', countryCode: 'DE', members: [] })),
}));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({
  findCategoryById: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({
  findProductsByShopId: vi.fn(),
  updateProduct: vi.fn(async (p: any) => p),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn() }));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { findCategoryById } from '../../../src/infrastructure/cosmos/category/CosmosCategoryRepository';
import { findProductsByShopId, updateProduct } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { executeApplyCategoryTaxClass } from '../../../src/application/category/applyCategoryTaxClass/executeApplyCategoryTaxClass';

const dish = (id: string, extra: any = {}) => ({ id, name: id, categoryIds: ['drinks'], isDeleted: false, taxClassId: 'food', ...extra });

describe('apply a category\'s tax class to its dishes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue({ ok: true, actor: { actorType: 'owner', actorId: 'u1' } });
    (findCategoryById as any).mockResolvedValue({ id: 'drinks', shopId: 'shop-1', isDeleted: false, taxClassId: 'beverage' });
  });

  it('sets the dishes in the category that differ, and only those', async () => {
    (findProductsByShopId as any).mockResolvedValue([
      dish('cola'),
      dish('water', { taxClassId: 'beverage' }),
      dish('pasta', { categoryIds: ['pasta'] }),
      dish('old', { isDeleted: true }),
      dish('menu', { combo: { groups: [] }, taxClassId: null }),
    ]);
    const result = await executeApplyCategoryTaxClass({ shopId: 'shop-1', categoryId: 'drinks' }, {} as any);

    expect(result).toEqual({ ok: true, data: { taxClassId: 'beverage', updatedCount: 1 } });
    expect(updateProduct).toHaveBeenCalledTimes(1);
    expect(updateProduct).toHaveBeenCalledWith(expect.objectContaining({ id: 'cola', taxClassId: 'beverage' }));
  });

  it('refuses someone who may not edit the menu', async () => {
    (authorizeShopAction as any).mockResolvedValue({ ok: false, code: 'FORBIDDEN', error: 'no' });
    const result = await executeApplyCategoryTaxClass({ shopId: 'shop-1', categoryId: 'drinks' }, {} as any);
    expect(result.ok).toBe(false);
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('a deleted category is not found', async () => {
    (findCategoryById as any).mockResolvedValue({ id: 'drinks', isDeleted: true, taxClassId: 'beverage' });
    expect(await executeApplyCategoryTaxClass({ shopId: 'shop-1', categoryId: 'drinks' }, {} as any)).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
  });
});
