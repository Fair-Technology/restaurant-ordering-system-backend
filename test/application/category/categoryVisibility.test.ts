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

describe("category switch and times", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    (createCategory as any).mockImplementation(async (c: any) => c);
    (updateCategory as any).mockImplementation(async (c: any) => c);
    (getReferenceLists as any).mockResolvedValue(DE_REFERENCE_LISTS);
  });

  const update = (body: Record<string, unknown>) =>
    executeUpdateCategory({ shopId: 'shop-1', categoryId: 'c1', ...body } as any, {} as any);

  it('a new category starts switched on with no times', async () => {
    await executeCreateCategory({ shopId: 'shop-1', name: 'Pizza' } as any, {} as any);
    expect(createCategory).toHaveBeenCalledWith(expect.objectContaining({ isAvailable: true, schedule: null }));
  });

  it('an old category without the field reads as on', async () => {
    const result = await update({ name: 'Drinks' });
    expect(result.ok && result.data).toMatchObject({ isAvailable: true, schedule: null });
  });

  it('switches off and saves times', async () => {
    const schedule = { daysOfWeek: [1, 2, 3, 4, 5], startTime: '11:30', endTime: '14:30' };
    const result = await update({ isAvailable: false, schedule });
    expect(result.ok && result.data).toMatchObject({ isAvailable: false, schedule });
    expect(updateCategory).toHaveBeenCalledWith(expect.objectContaining({ isAvailable: false, schedule }));
  });

  it('null clears the times', async () => {
    const result = await update({ schedule: null });
    expect(result.ok && result.data).toMatchObject({ schedule: null });
  });

  it('refuses bad input without saving', async () => {
    expect(await update({ isAvailable: 'no' })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(await update({ schedule: { daysOfWeek: [1], startTime: '15:00', endTime: '14:00' } })).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });
    expect(updateCategory).not.toHaveBeenCalled();
  });
});
