import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (actor: any) => ({ actorType: actor.actorType, actorId: actor.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(async () => ({ id: 'shop-1', countryCode: 'DE', members: [] })),
}));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({
  createCategory: vi.fn(async (c: any) => c),
  findCategoriesByShopId: vi.fn(async () => []),
  findCategoryById: vi.fn(async () => ({
    id: 'c1',
    shopId: 'shop-1',
    name: 'Getränke',
    sortOrder: 1,
    isDeleted: false,
    taxClassId: 'food',
    createdAt: 'x',
    updatedAt: 'x',
  })),
  updateCategory: vi.fn(async (c: any) => c),
}));
vi.mock('../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository', () => ({
  getReferenceLists: vi.fn(),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({
  logAudit: vi.fn(),
  diffFields: vi.fn(() => []),
}));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { createCategory, updateCategory } from '../../../src/infrastructure/cosmos/category/CosmosCategoryRepository';
import { getReferenceLists } from '../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository';
import { executeCreateCategory } from '../../../src/application/category/createCategory/executeCreateCategory';
import { executeUpdateCategory } from '../../../src/application/category/updateCategory/executeUpdateCategory';
import { DE_REFERENCE_LISTS } from '../../../src/domain/reference/ReferenceLists';

const ownerAccess = {
  ok: true,
  actor: { actorType: 'owner', actorId: 'u1', role: 'owner' },
  permissions: ['manage_menu'],
};

describe('category tax class', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    (createCategory as any).mockImplementation(async (c: any) => c);
    (updateCategory as any).mockImplementation(async (c: any) => c);
    (getReferenceLists as any).mockResolvedValue(DE_REFERENCE_LISTS);
  });

  it('defaults to the country default class', async () => {
    const result = await executeCreateCategory({ shopId: 'shop-1', name: 'Pizza' } as any, {} as any);

    expect(result.ok).toBe(true);
    expect(createCategory).toHaveBeenCalledWith(
      expect.objectContaining({ taxClassId: 'food', nameTranslations: {} }),
    );
  });

  it('accepts beverage', async () => {
    const result = await executeCreateCategory(
      { shopId: 'shop-1', name: 'Getränke', taxClassId: 'beverage' } as any,
      {} as any,
    );

    expect(result.ok).toBe(true);
    expect(createCategory).toHaveBeenCalledWith(expect.objectContaining({ taxClassId: 'beverage' }));
  });

  it('rejects an unknown class', async () => {
    const result = await executeCreateCategory(
      { shopId: 'shop-1', name: 'Wine', taxClassId: 'wine' } as any,
      {} as any,
    );

    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'Unknown tax class: wine' });
  });

  it('changes the class and translation', async () => {
    const result = await executeUpdateCategory(
      { categoryId: 'c1', shopId: 'shop-1', taxClassId: 'beverage', nameTranslations: { en: 'Drinks' } } as any,
      {} as any,
    );

    expect(result.ok).toBe(true);
    expect(updateCategory).toHaveBeenCalledWith(
      expect.objectContaining({ taxClassId: 'beverage', nameTranslations: { en: 'Drinks' } }),
    );
  });
});
