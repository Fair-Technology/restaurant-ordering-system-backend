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
import { createCategory, findCategoriesByShopId, updateCategory } from '../../../src/infrastructure/cosmos/category/CosmosCategoryRepository';
import { getReferenceLists } from '../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository';
import { executeCreateCategory } from '../../../src/application/category/createCategory/executeCreateCategory';
import { executeUpdateCategory } from '../../../src/application/category/updateCategory/executeUpdateCategory';
import { DE_REFERENCE_LISTS } from '../../../src/domain/reference/ReferenceLists';

const ownerAccess = {
  ok: true,
  actor: { actorType: 'owner', actorId: 'u1', role: 'owner' },
  permissions: ['manage_menu'],
};

describe('executeUpdateCategory name validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    (updateCategory as any).mockImplementation(async (c: any) => c);
    (getReferenceLists as any).mockResolvedValue(DE_REFERENCE_LISTS);
  });

  const update = (body: Record<string, unknown>) =>
    executeUpdateCategory({ shopId: 'shop-1', categoryId: 'c1', ...body } as any, {} as any);

  it.each([['whitespace-only', '   '], ['empty', ''], ['non-string', 42]])(
    'rejects a %s name with INVALID_INPUT and does not save',
    async (_label, name) => {
      expect(await update({ name })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
      expect(updateCategory).not.toHaveBeenCalled();
    },
  );

  it('keeps the existing name when name is omitted', async () => {
    const result = await update({ isAvailable: false });
    expect(result.ok && result.data).toMatchObject({ name: 'Getränke', isAvailable: false });
  });

  it('trims and saves a provided name', async () => {
    const result = await update({ name: '  Drinks  ' });
    expect(result.ok && result.data).toMatchObject({ name: 'Drinks' });
  });

  describe('uniqueness within the shop', () => {
    const siblings = [
      { id: 'c1', shopId: 'shop-1', name: 'Getränke' },
      { id: 'c2', shopId: 'shop-1', name: 'Drinks' },
    ];

    it('rejects a name that matches another category ignoring case and spaces', async () => {
      (findCategoriesByShopId as any).mockResolvedValue(siblings);
      expect(await update({ name: '  drinks  ' })).toMatchObject({
        ok: false,
        code: 'CONFLICT',
        errorCode: 'CATEGORY_NAME_EXISTS',
        field: 'name',
      });
      expect(updateCategory).not.toHaveBeenCalled();
    });

    it("allows saving the category's own name back with different case/spacing", async () => {
      (findCategoriesByShopId as any).mockResolvedValue(siblings);
      const result = await update({ name: ' GETRÄNKE ' });
      expect(result.ok && result.data).toMatchObject({ name: 'GETRÄNKE' });
    });

    it('allows a genuinely new name', async () => {
      (findCategoriesByShopId as any).mockResolvedValue(siblings);
      const result = await update({ name: 'Desserts' });
      expect(result.ok).toBe(true);
    });

    it('does not run the check when name is omitted', async () => {
      (findCategoriesByShopId as any).mockResolvedValue(siblings);
      const result = await update({ isAvailable: false });
      expect(result.ok).toBe(true);
      expect(findCategoriesByShopId).not.toHaveBeenCalled();
    });
  });
});
