import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository', () => ({ findShopOptionGroupsByShopId: vi.fn(async () => []) }));
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
import { PRODUCT_PRICE_ERROR } from '../../../src/domain/product/price';
import { PRODUCT_NAME_ERROR, PRODUCT_DESCRIPTION_ERROR } from '../../../src/domain/product/naming';

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

  it('reads the categories once even when categoryIds is not part of the update', async () => {
    const result = await executeUpdateProduct({ productId: 'p1', shopId: 'shop-1', name: 'Margherita 2' } as any, {} as any);

    expect(result.ok).toBe(true);
    expect(findCategoriesByShopId).toHaveBeenCalledTimes(1);
  });

  it('a dish saved before dishes owned their class gets its category\'s copied in on its next save', async () => {
    await executeUpdateProduct({ productId: 'p1', shopId: 'shop-1', name: 'Margherita 2' } as any, {} as any);
    expect(updateProduct).toHaveBeenCalledWith(expect.objectContaining({ taxClassId: 'food' }));
  });

  it('null (the old "inherit") copies the category\'s class instead of storing null', async () => {
    (findProductById as any).mockResolvedValue(storedProduct({ taxClassId: 'beverage' }));
    await executeUpdateProduct({ productId: 'p1', shopId: 'shop-1', taxClassId: null } as any, {} as any);
    expect(updateProduct).toHaveBeenCalledWith(expect.objectContaining({ taxClassId: 'food' }));
  });

  it('keeps the dish\'s own class when it differs from its category\'s', async () => {
    (findProductById as any).mockResolvedValue(storedProduct({ taxClassId: 'beverage' }));
    await executeUpdateProduct({ productId: 'p1', shopId: 'shop-1', name: 'Kinder-Apfelschorle' } as any, {} as any);
    expect(updateProduct).toHaveBeenCalledWith(expect.objectContaining({ taxClassId: 'beverage' }));
  });

  it('an imported dish without a class gets its first category\'s when it is given one', async () => {
    (findProductById as any).mockResolvedValue(storedProduct({ categoryIds: [], isAvailable: false }));
    (findCategoriesByShopId as any).mockResolvedValue([{ id: 'drinks', shopId: 'shop-1', isDeleted: false, taxClassId: 'beverage' }]);
    await executeUpdateProduct({ productId: 'p1', shopId: 'shop-1', categoryIds: ['drinks'] } as any, {} as any);
    expect(updateProduct).toHaveBeenCalledWith(expect.objectContaining({ taxClassId: 'beverage' }));
  });

  it("keeps an extra's allergens when an older admin leaves them out", async () => {
    (findProductById as any).mockResolvedValue(
      storedProduct({
        allergenIds: [],
        additiveIds: [],
        addonGroups: [{ id: 'a1', name: 'Extras', minSelectable: 0, maxSelectable: 1, options: [{ id: 'x1', name: 'Thunfisch', priceDelta: 150, isAvailable: true, allergenIds: ['fish'], additiveIds: [] }] }],
      }),
    );
    const result = await executeUpdateProduct(
      { productId: 'p1', shopId: 'shop-1', addonGroups: [{ id: 'a1', name: 'Extras', minSelectable: 0, maxSelectable: 1, options: [{ id: 'x1', name: 'Thunfisch', priceDelta: 200, isAvailable: true }] }] } as any,
      {} as any,
    );
    expect(result.ok).toBe(true);
    expect(updateProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        addonGroups: [{ id: 'a1', name: 'Extras', nameTranslations: {}, minSelectable: 0, maxSelectable: 1, options: [{ id: 'x1', name: 'Thunfisch', nameTranslations: {}, priceDelta: 200, isAvailable: true, allergenIds: ['fish'], additiveIds: [] }] }],
      }),
    );
  });

  it("stores the offer label's translations with the schedule", async () => {
    const schedule = { startDate: '2026-09-01', offerPrice: 700, offerLabel: 'Angebot des Tages', offerLabelTranslations: { en: " Today's special " } };
    const result = await executeUpdateProduct({ productId: 'p1', shopId: 'shop-1', schedule } as any, {} as any);

    expect(result.ok).toBe(true);
    expect(updateProduct).toHaveBeenCalledWith(
      expect.objectContaining({ schedule: { ...schedule, offerLabelTranslations: { en: "Today's special" } } }),
    );
  });

  it('still clears a schedule with null', async () => {
    (findProductById as any).mockResolvedValue(storedProduct({ schedule: { startDate: '2026-09-01', offerLabel: 'Angebot' } }));
    const result = await executeUpdateProduct({ productId: 'p1', shopId: 'shop-1', schedule: null } as any, {} as any);
    expect(result.ok).toBe(true);
    expect(updateProduct).toHaveBeenCalledWith(expect.objectContaining({ schedule: null }));
  });

  it.each([
    ['a non-object', ['Today'], 'translations must be an object keyed by language code'],
    ['an unsupported language', { xx: 'Today' }, 'Unsupported language: xx'],
    ['an over-long translation', { en: 'x'.repeat(51) }, 'Translation for en must be at most 50 characters'],
  ])("rejects %s as the offer label's translations", async (_, offerLabelTranslations, error) => {
    const schedule = { startDate: '2026-09-01', offerPrice: 700, offerLabel: 'Angebot des Tages', offerLabelTranslations };
    const result = await executeUpdateProduct({ productId: 'p1', shopId: 'shop-1', schedule } as any, {} as any);

    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT', error });
    expect(updateProduct).not.toHaveBeenCalled();
  });
});

describe('executeUpdateProduct price', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    (updateProduct as any).mockImplementation(async (p: any) => p);
    (getReferenceLists as any).mockResolvedValue(DE_REFERENCE_LISTS);
    (findProductById as any).mockResolvedValue(storedProduct());
  });

  it.each([12.5, NaN, 'abc', -3])('rejects the price %s', async (price) => {
    const result = await executeUpdateProduct({ productId: 'p1', shopId: 'shop-1', price } as any, {} as any);

    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT', error: PRODUCT_PRICE_ERROR });
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it.each([0, 900, 100000])('accepts the price %s', async (price) => {
    const result = await executeUpdateProduct({ productId: 'p1', shopId: 'shop-1', price } as any, {} as any);

    expect(result.ok).toBe(true);
    expect(updateProduct).toHaveBeenCalledWith(expect.objectContaining({ price }));
  });
});

describe('executeUpdateProduct name and description', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    (updateProduct as any).mockImplementation(async (p: any) => p);
    (getReferenceLists as any).mockResolvedValue(DE_REFERENCE_LISTS);
    (findProductById as any).mockResolvedValue(storedProduct());
  });

  it.each(['', '   ', 123, null])('rejects the name %j', async (name) => {
    const result = await executeUpdateProduct({ productId: 'p1', shopId: 'shop-1', name } as any, {} as any);

    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT', error: PRODUCT_NAME_ERROR });
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it.each(['', 123, null])('rejects the description %j', async (description) => {
    const result = await executeUpdateProduct({ productId: 'p1', shopId: 'shop-1', description } as any, {} as any);

    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT', error: PRODUCT_DESCRIPTION_ERROR });
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('stores a trimmed name and the description', async () => {
    const result = await executeUpdateProduct(
      { productId: 'p1', shopId: 'shop-1', name: '  Calzone  ', description: 'Folded' } as any,
      {} as any,
    );

    expect(result.ok).toBe(true);
    expect(updateProduct).toHaveBeenCalledWith(expect.objectContaining({ name: 'Calzone', description: 'Folded' }));
  });

  it('accepts a name-only update', async () => {
    const result = await executeUpdateProduct({ productId: 'p1', shopId: 'shop-1', name: 'Calzone' } as any, {} as any);

    expect(result.ok).toBe(true);
    expect(updateProduct).toHaveBeenCalledWith(expect.objectContaining({ name: 'Calzone' }));
  });
});
