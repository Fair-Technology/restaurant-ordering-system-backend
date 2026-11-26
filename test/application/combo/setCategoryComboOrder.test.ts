import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (actor: any) => ({ actorType: actor.actorType, actorId: actor.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(async () => ({ id: 'shop-1', isDeleted: false, members: [] })),
}));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({
  findCategoryById: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({
  findProductsByShopId: vi.fn(),
  updateProduct: vi.fn(async (p: any) => p),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({
  logAudit: vi.fn(),
  diffFields: vi.fn(() => []),
}));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { findCategoryById } from '../../../src/infrastructure/cosmos/category/CosmosCategoryRepository';
import { findProductsByShopId, updateProduct } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { executeSetCategoryComboOrder } from '../../../src/application/combo/setCategoryComboOrder/executeSetCategoryComboOrder';
import { executeSetCategoryDishOrder } from '../../../src/application/product/setCategoryDishOrder/executeSetCategoryDishOrder';

const ownerAccess = { ok: true, actor: { actorType: 'owner', actorId: 'u1' }, permissions: ['manage_menu'] };

let store: any[];
const prod = (id: string, name: string, categoryIds: string[], extra: Record<string, unknown> = {}) => ({
  id,
  shopId: 'shop-1',
  name,
  description: '',
  price: 100,
  categoryIds,
  images: [],
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
  ...extra,
});

const COMBO = { groups: [], bmfDrinkShare: false };
const runDish = (categoryId: string, productIds: any) =>
  executeSetCategoryDishOrder({ shopId: 'shop-1', categoryId, productIds }, {} as any);
const run = (categoryId: string, productIds: any) =>
  executeSetCategoryComboOrder({ shopId: 'shop-1', categoryId, productIds }, {} as any);

describe('executeSetCategoryComboOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    store = [
      prod('a', 'Apple', ['c1'], { combo: COMBO }),
      prod('b', 'Banana', ['c1', 'c2'], { combo: COMBO }),
      prod('c', 'Cherry', ['c1'], { combo: COMBO }),
      prod('d', 'Date', ['c2'], { combo: COMBO }),
      prod('e', 'Elder', ['c3'], { combo: COMBO }),
      prod('dish', 'Dish', ['c1']),
      prod('dish2', 'Dish2', ['c2']),
      prod('del', 'Deleted', ['c1'], { isDeleted: true, combo: COMBO }),
      { ...prod('x', 'Foreign', ['c1'], { combo: COMBO }), shopId: 'shop-2' },
    ];
    (findProductsByShopId as any).mockImplementation(async () => store.filter((p) => p.shopId === 'shop-1' && !p.isDeleted));
    (updateProduct as any).mockImplementation(async (p: any) => {
      store = store.map((s) => (s.id === p.id ? p : s));
      return p;
    });
    (findCategoryById as any).mockImplementation(async (id: string) => ({
      id,
      shopId: 'shop-1',
      name: id,
      sortOrder: 1,
      isDeleted: false,
    }));
  });

  it('reorders, persists, returns the final order and audits', async () => {
    const result = await run('c1', ['c', 'a', 'b']);
    expect(result).toEqual({
      ok: true,
      data: {
        categoryId: 'c1',
        products: [
          { id: 'c', name: 'Cherry' },
          { id: 'a', name: 'Apple' },
          { id: 'b', name: 'Banana' },
        ],
      },
    });
    expect(updateProduct).toHaveBeenCalledTimes(3);
    expect(store.find((p) => p.id === 'c').categoryOrder).toEqual({ c1: 0 });
    expect(store.find((p) => p.id === 'b').categoryOrder).toEqual({ c1: 2 });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'category.comboOrder.update', entityType: 'category', entityId: 'c1' }),
    );
  });

  it('is idempotent: the same order twice writes nothing the second time', async () => {
    const first = await run('c1', ['c', 'a', 'b']);
    vi.clearAllMocks();
    const second = await run('c1', ['c', 'a', 'b']);
    expect(second).toEqual(first);
    expect(updateProduct).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('writes only the combos whose position changed', async () => {
    await run('c1', ['a', 'b', 'c']);
    vi.clearAllMocks();
    await run('c1', ['a', 'c', 'b']);
    expect((updateProduct as any).mock.calls.map((c: any) => c[0].id).sort()).toEqual(['b', 'c']);
  });

  it('rejects a dish id with a combo-worded error', async () => {
    expect(await run('c1', ['a', 'b', 'c', 'dish'])).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'Not a combo of this category in this shop: dish',
    });
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('does not require the category dishes in the list', async () => {
    expect((await run('c1', ['a', 'b', 'c'])).ok).toBe(true);
  });

  it('missing combos are named in a combo-worded error', async () => {
    expect(await run('c1', ['a', 'b'])).toMatchObject({
      error: 'productIds must list every combo in the category; missing: c',
    });
  });

  it('rejects a foreign-shop id', async () => {
    expect(await run('c1', ['a', 'b', 'c', 'x'])).toMatchObject({ ok: false, code: 'INVALID_INPUT', error: expect.stringContaining('x') });
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('rejects an id from a different category', async () => {
    expect(await run('c1', ['a', 'b', 'c', 'd'])).toMatchObject({ ok: false, code: 'INVALID_INPUT', error: expect.stringContaining('d') });
  });

  it('rejects an unknown or deleted id', async () => {
    expect(await run('c1', ['a', 'b', 'c', 'nope'])).toMatchObject({ ok: false, code: 'INVALID_INPUT', error: expect.stringContaining('nope') });
    expect(await run('c1', ['a', 'b', 'c', 'del'])).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('rejects duplicate ids', async () => {
    expect(await run('c1', ['a', 'a', 'b', 'c'])).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('rejects a list that misses combos of the category', async () => {
    expect(await run('c1', ['a', 'b'])).toMatchObject({ ok: false, code: 'INVALID_INPUT', error: expect.stringContaining('c') });
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('rejects non-array and non-string entries', async () => {
    expect(await run('c1', undefined)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(await run('c1', ['a', '', 'b'])).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(await run('c1', ['a', 5, 'b'])).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('accepts an empty list only when the category has no combos', async () => {
    expect(await run('c1', [])).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(await run('empty', [])).toEqual({ ok: true, data: { categoryId: 'empty', products: [] } });
  });

  it('404s for a missing, deleted or foreign category', async () => {
    (findCategoryById as any).mockResolvedValueOnce(null);
    expect(await run('c1', ['a'])).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    (findCategoryById as any).mockResolvedValueOnce({ id: 'c1', shopId: 'shop-1', isDeleted: true });
    expect(await run('c1', ['a'])).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    (findCategoryById as any).mockResolvedValueOnce({ id: 'c1', shopId: 'shop-2', isDeleted: false });
    expect(await run('c1', ['a'])).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('returns the authorization failure without writing', async () => {
    (authorizeShopAction as any).mockResolvedValue({ ok: false, code: 'FORBIDDEN', error: 'no' });
    expect(await run('c1', ['a', 'b', 'c'])).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('returns INTERNAL_ERROR when a write fails', async () => {
    (updateProduct as any).mockRejectedValueOnce(new Error('boom'));
    expect(await run('c1', ['c', 'a', 'b'])).toMatchObject({ ok: false, code: 'INTERNAL_ERROR' });
  });

  it('combos are invisible to dish-order and dishes to combo-order', async () => {
    // dish-order for c1 requires exactly the dish 'dish'; a combo id is rejected like a foreign product
    expect(await runDish('c1', ['dish', 'a'])).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'Not a dish of this category in this shop: a',
    });
    expect(await runDish('c1', [])).toMatchObject({
      error: 'productIds must list every dish in the category; missing: dish',
    });
    expect(await runDish('c1', ['dish'])).toMatchObject({ ok: true });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'category.dishOrder.update' }));
    // writing the dish order left every combo alone
    expect(store.filter((p) => p.combo).every((p) => p.categoryOrder === undefined)).toBe(true);
  });

  it('keeps independent positions for a combo in two categories', async () => {
    await run('c1', ['b', 'a', 'c']); // b -> 0 in c1
    await run('c2', ['d', 'b']); // b -> 1 in c2 (dish2 is a dish, not part of the combo set)
    const b = store.find((p) => p.id === 'b');
    expect(b.categoryOrder).toEqual({ c1: 0, c2: 1 });
    await run('c2', ['b', 'd']);
    expect(store.find((p) => p.id === 'b').categoryOrder).toEqual({ c1: 0, c2: 0 });
  });
});
