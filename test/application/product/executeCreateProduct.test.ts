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
  createProduct: vi.fn(async (p: any) => p),
}));
vi.mock('../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository', () => ({
  getReferenceLists: vi.fn(),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({
  logAudit: vi.fn(),
}));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { createProduct } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { findCategoriesByShopId } from '../../../src/infrastructure/cosmos/category/CosmosCategoryRepository';
import { getReferenceLists } from '../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository';
import { executeCreateProduct } from '../../../src/application/product/createProduct/executeCreateProduct';
import { DE_REFERENCE_LISTS } from '../../../src/domain/reference/ReferenceLists';

const ownerAccess = {
  ok: true,
  actor: { actorType: 'owner', actorId: 'u1', role: 'owner' },
  permissions: ['manage_menu'],
};

const base = { shopId: 'shop-1', name: 'Margherita', description: 'Tomate', price: 900, categoryIds: ['c1'] };

describe('executeCreateProduct menu fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    (createProduct as any).mockImplementation(async (p: any) => p);
    (getReferenceLists as any).mockResolvedValue(DE_REFERENCE_LISTS);
  });

  it('stores the declared menu fields', async () => {
    const result = await executeCreateProduct({ ...base, allergenIds: ['milk'], additiveIds: [] } as any, {} as any);

    expect(result.ok).toBe(true);
    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        allergenIds: ['milk'],
        additiveIds: [],
        dietaryTagIds: [],
        spiceLevel: null,
        prepMinutes: null,
        taxClassId: null,
      }),
    );
    if (!result.ok) return;
    expect((result.data as any).isDeclared).toBe(true);
    expect('taxRateId' in result.data).toBe(false);
  });

  it('leaves a new dish undeclared without a declaration', async () => {
    const result = await executeCreateProduct(base as any, {} as any);

    expect(result.ok).toBe(true);
    expect(createProduct).toHaveBeenCalledWith(expect.objectContaining({ allergenIds: null, additiveIds: null }));
    if (!result.ok) return;
    expect((result.data as any).isDeclared).toBe(false);
  });

  it('rejects an unknown additive', async () => {
    const result = await executeCreateProduct({ ...base, additiveIds: ['E999'] } as any, {} as any);

    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'Unknown additive: E999' });
    expect(createProduct).not.toHaveBeenCalled();
  });

  // Saving a dish used to validate each selected category with its own
  // findCategoryById read, so picking several categories made a create take
  // seconds. This checks it stays a single batched read regardless of how
  // many category ids are selected.
  it('validates several category ids with one query, not one per id', async () => {
    (findCategoriesByShopId as any).mockResolvedValue([
      { id: 'c1', shopId: 'shop-1', isDeleted: false },
      { id: 'c2', shopId: 'shop-1', isDeleted: false },
      { id: 'c3', shopId: 'shop-1', isDeleted: false },
    ]);

    const result = await executeCreateProduct({ ...base, categoryIds: ['c1', 'c2', 'c3'] } as any, {} as any);

    expect(result.ok).toBe(true);
    expect(findCategoriesByShopId).toHaveBeenCalledTimes(1);
    expect(findCategoriesByShopId).toHaveBeenCalledWith('shop-1');
  });

  it('skips the category query entirely when no category ids are given', async () => {
    const result = await executeCreateProduct({ ...base, categoryIds: [] } as any, {} as any);

    expect(result.ok).toBe(true);
    expect(findCategoriesByShopId).not.toHaveBeenCalled();
  });
});
