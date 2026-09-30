import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (actor: any) => ({ actorType: actor.actorType, actorId: actor.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(async () => ({ id: 'shop-1', countryCode: 'DE', members: [] })),
}));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({
  findCategoriesByShopId: vi.fn(async () => [{ id: 'c1', shopId: 'shop-1', isDeleted: false, taxClassId: 'food' }]),
}));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({
  findProductById: vi.fn(),
  updateProduct: vi.fn(async (p: any) => p),
}));
vi.mock('../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository', () => ({
  getReferenceLists: vi.fn(),
}));
vi.mock('../../../src/infrastructure/storage/blobStorageHelpers', () => ({
  deleteBlob: vi.fn(),
  extractBlobPath: vi.fn(),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({
  logAudit: vi.fn(),
  diffFields: vi.fn(() => []),
}));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { findProductById, updateProduct } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { findCategoriesByShopId } from '../../../src/infrastructure/cosmos/category/CosmosCategoryRepository';
import { getReferenceLists } from '../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository';
import { executeUpdateProduct } from '../../../src/application/product/updateProduct/executeUpdateProduct';
import { DE_REFERENCE_LISTS } from '../../../src/domain/reference/ReferenceLists';

const ownerAccess = {
  ok: true,
  actor: { actorType: 'owner', actorId: 'u1', role: 'owner' },
  permissions: ['manage_menu'],
};

function storedProduct(overrides: any = {}) {
  return {
    id: 'p1',
    shopId: 'shop-1',
    name: 'Margherita',
    description: 'x',
    price: 900,
    categoryIds: ['c1'],
    images: [],
    isAvailable: true,
    isDeleted: false,
    allergenIds: null,
    additiveIds: null,
    dietaryTagIds: [],
    spiceLevel: null,
    prepMinutes: null,
    taxClassId: null,
    createdAt: 'x',
    updatedAt: 'x',
    ...overrides,
  };
}

describe('executeUpdateProduct menu fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    (updateProduct as any).mockImplementation(async (p: any) => p);
    (getReferenceLists as any).mockResolvedValue(DE_REFERENCE_LISTS);
    (findProductById as any).mockResolvedValue(storedProduct());
  });

  it('declares allergens on an existing dish', async () => {
    const result = await executeUpdateProduct(
      { productId: 'p1', shopId: 'shop-1', allergenIds: [], additiveIds: [] } as any,
      {} as any,
    );

    expect(result.ok).toBe(true);
    expect(updateProduct).toHaveBeenCalledWith(expect.objectContaining({ allergenIds: [], additiveIds: [] }));
    if (!result.ok) return;
    expect((result.data as any).isDeclared).toBe(true);
  });

  it('rejects a vegan tag that conflicts with a stored allergen', async () => {
    (findProductById as any).mockResolvedValue(storedProduct({ allergenIds: ['milk'] }));

    const result = await executeUpdateProduct(
      { productId: 'p1', shopId: 'shop-1', dietaryTagIds: ['vegan'] } as any,
      {} as any,
    );

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'A dish tagged vegan cannot contain the milk allergen',
    });
  });

  // Saving a dish used to validate each selected category with its own
  // findCategoryById read, so re-picking several categories made a save take
  // seconds. This checks it stays a single batched read regardless of how
  // many category ids are selected.
  it('validates several category ids with one query, not one per id', async () => {
    (findCategoriesByShopId as any).mockResolvedValue([
      { id: 'c1', shopId: 'shop-1', isDeleted: false },
      { id: 'c2', shopId: 'shop-1', isDeleted: false },
      { id: 'c3', shopId: 'shop-1', isDeleted: false },
    ]);

    const result = await executeUpdateProduct(
      { productId: 'p1', shopId: 'shop-1', categoryIds: ['c1', 'c2', 'c3'] } as any,
      {} as any,
    );

    expect(result.ok).toBe(true);
    expect(findCategoriesByShopId).toHaveBeenCalledTimes(1);
    expect(findCategoriesByShopId).toHaveBeenCalledWith('shop-1');
  });

  it('skips the category query when categoryIds is not part of the update', async () => {
    const result = await executeUpdateProduct({ productId: 'p1', shopId: 'shop-1', name: 'Margherita 2' } as any, {} as any);

    expect(result.ok).toBe(true);
    expect(findCategoriesByShopId).not.toHaveBeenCalled();
  });
});
