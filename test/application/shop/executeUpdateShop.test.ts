import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (actor: any) => ({ actorType: actor.actorType, actorId: actor.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
  updateShop: vi.fn(async (s: any) => s),
}));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({
  findProductsByShopId: vi.fn(async () => []),
}));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({
  findCategoriesByShopId: vi.fn(async () => []),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({
  logAudit: vi.fn(),
  diffFields: vi.fn(() => []),
}));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { findShopById, updateShop } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { executeUpdateShop } from '../../../src/application/shop/updateShop/executeUpdateShop';

const ownerAccess = {
  ok: true,
  actor: { actorType: 'owner', actorId: 'u1', role: 'owner' },
  permissions: ['manage_shop'],
};

function makeShop(overrides: any = {}) {
  return {
    id: 'shop-1',
    name: 'Pizzeria',
    slug: 'p',
    countryCode: 'DE',
    menuLanguages: ['de'],
    isPaused: true,
    address: {},
    openingHours: {},
    members: [],
    createdAt: 'x',
    updatedAt: 'x',
    isDeleted: false,
    ...overrides,
  };
}

describe('executeUpdateShop menu languages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    (findShopById as any).mockResolvedValue(makeShop());
    (updateShop as any).mockImplementation(async (s: any) => s);
  });

  it('saves an added menu language', async () => {
    const result = await executeUpdateShop({ shopId: 'shop-1', menuLanguages: ['de', 'en'] } as any, {} as any);

    expect(result.ok).toBe(true);
    expect(updateShop).toHaveBeenCalledWith(expect.objectContaining({ menuLanguages: ['de', 'en'] }));
  });

  it('refuses to change the original language', async () => {
    const result = await executeUpdateShop({ shopId: 'shop-1', menuLanguages: ['en'] } as any, {} as any);

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'The original menu language (de) cannot be changed',
    });
  });
});
