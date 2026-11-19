import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(async () => ({
    ok: true,
    actor: { actorType: 'owner', actorId: 'u1' },
    permissions: ['manage_menu', 'manage_stock'],
  })),
  toAuditActor: (actor: any) => ({ actorType: actor.actorType, actorId: actor.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(async () => ({ id: 'shop-1', timezone: 'Europe/Berlin', members: [] })),
}));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({
  findProductById: vi.fn(),
  updateProduct: vi.fn(async (p: any) => p),
}));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({
  findCategoriesByShopId: vi.fn(async () => [{ id: 'c1', shopId: 'shop-1', name: 'Pasta', isDeleted: false }]),
}));
vi.mock('../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository', () => ({
  getReferenceLists: vi.fn(async () => ({ allergens: [], additives: [], dietaryTags: [] })),
}));
vi.mock('../../../src/infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository', () => ({
  findShopOptionGroupsByShopId: vi.fn(async () => []),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({
  logAudit: vi.fn(),
  diffFields: vi.fn(() => []),
}));
vi.mock('../../../src/infrastructure/storage/blobStorageHelpers', () => ({
  deleteBlob: vi.fn(),
}));

import { findProductById, updateProduct } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { executeUpdateProduct } from '../../../src/application/product/updateProduct/executeUpdateProduct';
import { executeUpdateProductAvailability } from '../../../src/application/product/updateProductAvailability/executeUpdateProductAvailability';
import { executeDeleteProduct } from '../../../src/application/product/deleteProduct/executeDeleteProduct';

function deletedProduct() {
  return {
    id: 'p1',
    shopId: 'shop-1',
    name: 'Carbonara',
    description: 'x',
    price: 1050,
    categoryIds: ['c1'],
    images: [],
    isAvailable: true,
    isDeleted: true,
    allergenIds: [],
    additiveIds: [],
    dietaryTagIds: [],
    spiceLevel: null,
    prepMinutes: null,
    taxClassId: null,
    createdAt: 'x',
    updatedAt: 'x',
  };
}

describe('a soft-deleted dish is not found to every write', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findProductById as any).mockResolvedValue(deletedProduct());
  });

  it('update answers NOT_FOUND', async () => {
    const result = await executeUpdateProduct({ productId: 'p1', shopId: 'shop-1', name: 'Renamed' }, {} as any);

    expect(result).toEqual({ ok: false, code: 'NOT_FOUND', error: 'Product not found' });
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('availability answers NOT_FOUND', async () => {
    const result = await executeUpdateProductAvailability(
      { productId: 'p1', shopId: 'shop-1', isAvailable: false },
      {} as any,
    );

    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('a second delete answers NOT_FOUND', async () => {
    const result = await executeDeleteProduct({ productId: 'p1', shopId: 'shop-1' } as any, {} as any);

    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(updateProduct).not.toHaveBeenCalled();
  });
});
