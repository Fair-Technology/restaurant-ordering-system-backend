import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (actor: any) => ({ actorType: actor.actorType, actorId: actor.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(async () => ({ id: 'shop-1', timezone: 'Europe/Berlin', members: [] })),
}));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({
  findProductById: vi.fn(),
  updateProduct: vi.fn(async (p: any) => p),
}));
vi.mock('../../../src/application/_shared/auditHelpers', async (io) => ({
  ...(await io<object>()),
  logAudit: vi.fn(),
}));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { findProductById, updateProduct } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { DEFAULT_ROLE_PERMISSIONS, permissionsForRole } from '../../../src/domain/system/RolePermissions';
import { executeUpdateProductAvailability } from '../../../src/application/product/updateProductAvailability/executeUpdateProductAvailability';

const accessWith = (permissions: string[]) => ({
  ok: true,
  actor: { actorType: 'staff' as const, actorId: 's1', role: 'staff' as const },
  permissions,
});

function storedProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    shopId: 'shop-1',
    name: 'Carbonara',
    description: 'x',
    price: 1050,
    categoryIds: ['pasta'],
    images: [{ id: 'i1', url: 'https://x/i1.jpg', sortOrder: 0, createdAt: 'x' }],
    isAvailable: true,
    isDeleted: false,
    allergenIds: [],
    additiveIds: [],
    dietaryTagIds: [],
    spiceLevel: null,
    prepMinutes: null,
    taxClassId: null,
    createdAt: 'x',
    updatedAt: 'x',
    ...overrides,
  };
}

describe('executeUpdateProductAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(accessWith(['manage_stock']));
    (updateProduct as any).mockImplementation(async (p: any) => p);
    (findProductById as any).mockResolvedValue(storedProduct());
  });

  it('manage_menu alone is enough', async () => {
    (authorizeShopAction as any).mockResolvedValue(accessWith(['manage_menu']));

    const result = await executeUpdateProductAvailability(
      { productId: 'p1', shopId: 'shop-1', isAvailable: false },
      {} as any,
    );

    expect(result.ok).toBe(true);
    expect(updateProduct).toHaveBeenCalledWith(expect.objectContaining({ isAvailable: false }));
  });

  it('the Staff default role grants access end-to-end (spec §11)', async () => {
    (authorizeShopAction as any).mockResolvedValue(
      accessWith(permissionsForRole('staff', DEFAULT_ROLE_PERMISSIONS)),
    );

    const result = await executeUpdateProductAvailability(
      { productId: 'p1', shopId: 'shop-1', isAvailable: false },
      {} as any,
    );

    expect(result.ok).toBe(true);
    expect(updateProduct).toHaveBeenCalled();
  });

  it('refuses a staff member with neither permission', async () => {
    (authorizeShopAction as any).mockResolvedValue(accessWith(['view_orders']));

    const result = await executeUpdateProductAvailability(
      { productId: 'p1', shopId: 'shop-1', isAvailable: false },
      {} as any,
    );

    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('passes an authorization failure straight through', async () => {
    (authorizeShopAction as any).mockResolvedValue({ ok: false, code: 'FORBIDDEN', error: 'You do not have access' });

    const result = await executeUpdateProductAvailability(
      { productId: 'p1', shopId: 'shop-1', isAvailable: false },
      {} as any,
    );

    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN', error: 'You do not have access' });
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('refuses a body that changes nothing', async () => {
    const result = await executeUpdateProductAvailability({ productId: 'p1', shopId: 'shop-1' }, {} as any);

    expect(result).toMatchObject({ ok: false, code: 'INVALID_INPUT', error: 'Send isAvailable' });
    expect(findProductById).not.toHaveBeenCalled();
  });

  it('silently ignores an unavailableUntil key in the body', async () => {
    const result = await executeUpdateProductAvailability(
      { productId: 'p1', shopId: 'shop-1', isAvailable: true, unavailableUntil: '2999-01-01T00:00:00Z' } as any,
      {} as any,
    );

    expect(result.ok).toBe(true);
    const written = (updateProduct as any).mock.calls[0][0];
    expect('unavailableUntil' in written).toBe(false);
    const data = (result as any).data;
    expect(data).not.toHaveProperty('unavailableUntil');
    expect(data).not.toHaveProperty('soldOut');
  });

  it('does not read or echo a legacy unavailableUntil stored on the product', async () => {
    (findProductById as any).mockResolvedValue(storedProduct({ unavailableUntil: '2099-01-01T00:00:00Z' } as any));

    const result = await executeUpdateProductAvailability(
      { productId: 'p1', shopId: 'shop-1', isAvailable: true },
      {} as any,
    );

    expect(result.ok).toBe(true);
    expect(updateProduct).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', isAvailable: true }));
    const data = (result as any).data;
    expect(data).not.toHaveProperty('unavailableUntil');
    expect(data).not.toHaveProperty('soldOut');
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ changes: [] }));
  });

  it('refuses a non-boolean isAvailable', async () => {
    const result = await executeUpdateProductAvailability(
      { productId: 'p1', shopId: 'shop-1', isAvailable: 'yes' as any },
      {} as any,
    );

    expect(result).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('will not switch a dish on without a category', async () => {
    (findProductById as any).mockResolvedValue(storedProduct({ categoryIds: [], isAvailable: false }));

    const result = await executeUpdateProductAvailability(
      { productId: 'p1', shopId: 'shop-1', isAvailable: true },
      {} as any,
    );

    expect(result).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('404s an unknown product and an unknown shop', async () => {
    (findProductById as any).mockResolvedValue(null);
    expect(
      await executeUpdateProductAvailability({ productId: 'p1', shopId: 'shop-1', isAvailable: false }, {} as any),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' });

    (findProductById as any).mockResolvedValue(storedProduct());
    const { findShopById } = await import('../../../src/infrastructure/cosmos/shop/CosmosShopRepository');
    (findShopById as any).mockResolvedValueOnce(null);
    expect(
      await executeUpdateProductAvailability({ productId: 'p1', shopId: 'shop-1', isAvailable: false }, {} as any),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it("keeps a combo's categoryOrder when flipping isAvailable", async () => {
    (authorizeShopAction as any).mockResolvedValue(accessWith(['manage_menu']));
    (findProductById as any).mockResolvedValue(
      storedProduct({ combo: { groups: [], bmfDrinkShare: false }, categoryOrder: { pasta: 3, other: 0 } }),
    );
    const result = await executeUpdateProductAvailability({ productId: 'p1', shopId: 'shop-1', isAvailable: false }, {} as any);
    expect(result.ok).toBe(true);
    expect(updateProduct).toHaveBeenCalledWith(
      expect.objectContaining({ isAvailable: false, categoryOrder: { pasta: 3, other: 0 } }),
    );
  });
});
