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
import { executeSetCategoryDishOrder } from '../../../src/application/product/setCategoryDishOrder/executeSetCategoryDishOrder';
import { sortByCategoryOrder } from '../../../src/domain/product/Product';
import { buildCatalog } from '../../../src/application/category/getCatalog/buildCatalog';
import { DE_REFERENCE_LISTS } from '../../../src/domain/reference/ReferenceLists';

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

const run = (categoryId: string, productIds: any) =>
  executeSetCategoryDishOrder({ shopId: 'shop-1', categoryId, productIds }, {} as any);

describe('executeSetCategoryDishOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    store = [
      prod('a', 'Apple', ['c1']),
      prod('b', 'Banana', ['c1', 'c2']),
      prod('c', 'Cherry', ['c1']),
      prod('d', 'Date', ['c2']),
      prod('e', 'Elder', ['c3']),
      prod('del', 'Deleted', ['c1'], { isDeleted: true }),
      { ...prod('x', 'Foreign', ['c1']), shopId: 'shop-2' },
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
      expect.objectContaining({ action: 'category.dishOrder.update', entityType: 'category', entityId: 'c1' }),
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

  it('writes only the dishes whose position changed', async () => {
    await run('c1', ['a', 'b', 'c']);
    vi.clearAllMocks();
    await run('c1', ['a', 'c', 'b']);
    expect((updateProduct as any).mock.calls.map((c: any) => c[0].id).sort()).toEqual(['b', 'c']);
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

  it('rejects a list that misses dishes of the category', async () => {
    expect(await run('c1', ['a', 'b'])).toMatchObject({ ok: false, code: 'INVALID_INPUT', error: expect.stringContaining('c') });
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('rejects non-array and non-string entries', async () => {
    expect(await run('c1', undefined)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(await run('c1', ['a', '', 'b'])).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(await run('c1', ['a', 5, 'b'])).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('accepts an empty list only when the category has no dishes', async () => {
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

  it('keeps independent positions for a dish in two categories', async () => {
    await run('c1', ['b', 'a', 'c']); // b -> 0 in c1
    await run('c2', ['d', 'b']); // b -> 1 in c2
    const b = store.find((p) => p.id === 'b');
    expect(b.categoryOrder).toEqual({ c1: 0, c2: 1 });
    await run('c2', ['b', 'd']);
    expect(store.find((p) => p.id === 'b').categoryOrder).toEqual({ c1: 0, c2: 0 });
  });

  describe('add to / remove from a category', () => {
    it('a dish added to a category with no position goes last', async () => {
      await run('c1', ['c', 'a', 'b']);
      const added = prod('n', 'Aaa-new', ['c1']);
      const list = sortByCategoryOrder([...store.filter((p) => p.categoryIds.includes('c1') && !p.isDeleted && p.shopId === 'shop-1'), added], 'c1');
      expect(list.map((p) => p.id)).toEqual(['c', 'a', 'b', 'n']);
    });

    it('a dish removed from a category no longer appears there whatever its categoryOrder', () => {
      const category: any = { id: 'c1', shopId: 'shop-1', name: 'C1', sortOrder: 1, taxClassId: 'food', isDeleted: false, createdAt: 'x', updatedAt: 'x' };
      const stays = prod('s', 'Stays', ['c1'], { categoryOrder: { c1: 1 } });
      const left = prod('l', 'Left', ['c2'], { categoryOrder: { c1: 0 } });
      const catalog = buildCatalog({
        shop: { timezone: 'Europe/Berlin', countryCode: 'DE', menuLanguages: ['de'] } as any,
        categories: [category],
        products: [stays, left] as any,
        refs: DE_REFERENCE_LISTS,
        lang: 'de',
        now: new Date('2026-09-25T10:00:00Z'),
      });
      expect(catalog.categories[0].products.map((p) => p.id)).toEqual(['s']);
    });
  });
});

describe('buildCatalog dish order', () => {
  const category: any = { id: 'c1', shopId: 'shop-1', name: 'C1', sortOrder: 1, taxClassId: 'food', isDeleted: false, createdAt: 'x', updatedAt: 'x' };
  const build = (products: any[]) =>
    buildCatalog({
      shop: { timezone: 'Europe/Berlin', countryCode: 'DE', menuLanguages: ['de'] } as any,
      categories: [category],
      products,
      refs: DE_REFERENCE_LISTS,
      lang: 'de',
      now: new Date('2026-09-25T10:00:00Z'),
    }).categories[0].products.map((p) => p.id);

  it('sorts by name for a shop that never reordered', () => {
    expect(build([prod('z', 'Zucchini', ['c1']), prod('a', 'Apfel', ['c1']), prod('m', 'Mango', ['c1'])])).toEqual(['a', 'm', 'z']);
  });

  it('honours categoryOrder with unordered dishes trailing by name', () => {
    expect(
      build([
        prod('z', 'Zucchini', ['c1'], { categoryOrder: { c1: 0 } }),
        prod('a', 'Apfel', ['c1']),
        prod('m', 'Mango', ['c1'], { categoryOrder: { c1: 1 } }),
        prod('b', 'Birne', ['c1']),
      ]),
    ).toEqual(['z', 'm', 'a', 'b']);
  });
});
