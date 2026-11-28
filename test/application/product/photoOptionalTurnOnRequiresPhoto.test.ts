import { beforeEach, describe, expect, it, vi } from 'vitest';

// A dish or combo may be saved without a photo, but only while it is off (SPECS §8).
// One in-memory product store stands in for Cosmos so the same state flows through every write path.
const store = new Map<string, any>();

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (a: { actorType: string; actorId: string }) => ({ actorType: a.actorType, actorId: a.actorId }),
}));
vi.mock('../../../src/application/_shared/auditHelpers', async (orig) => ({
  ...(await orig<object>()),
  logAudit: vi.fn(async () => undefined),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({ findCategoriesByShopId: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository', () => ({
  findShopOptionGroupsByShopId: vi.fn(async () => []),
}));
vi.mock('../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository', () => ({ getReferenceLists: vi.fn() }));
vi.mock('../../../src/application/_shared/deleteBlobWithVariants', () => ({ deleteBlobWithVariants: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({
  findProductById: vi.fn(async (id: string) => store.get(id) ?? null),
  findProductsByShopId: vi.fn(async () => [...store.values()]),
  createProduct: vi.fn(async (p: any) => (store.set(p.id, p), p)),
  updateProduct: vi.fn(async (p: any) => (store.set(p.id, p), p)),
}));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { findCategoriesByShopId } from '../../../src/infrastructure/cosmos/category/CosmosCategoryRepository';
import { getReferenceLists } from '../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { executeCreateProduct } from '../../../src/application/product/createProduct/executeCreateProduct';
import { executeUpdateProduct } from '../../../src/application/product/updateProduct/executeUpdateProduct';
import { executeUpdateProductAvailability } from '../../../src/application/product/updateProductAvailability/executeUpdateProductAvailability';
import { executeCreateCombo } from '../../../src/application/combo/createCombo/executeCreateCombo';
import { executeUpdateCombo } from '../../../src/application/combo/updateCombo/executeUpdateCombo';
import { buildCatalog } from '../../../src/application/category/getCatalog/buildCatalog';
import { DE_REFERENCE_LISTS } from '../../../src/domain/reference/ReferenceLists';
import { mapResultToHttp } from '../../../src/functions/_shared/mapResultToHttp';
import {
  DISH_ENABLE_NEEDS_PHOTO_ERROR,
  DISH_LEAVES_ON_WITHOUT_PHOTO_ERROR,
  PRODUCT_IMAGE_REQUIRED,
  PRODUCT_IMAGE_REQUIRED_TO_ENABLE,
} from '../../../src/domain/images/imageRules';
import {
  COMBO_ENABLE_NEEDS_PHOTO_ERROR,
  COMBO_IMAGE_REQUIRED_TO_ENABLE,
  COMBO_LEAVES_ON_WITHOUT_PHOTO_ERROR,
} from '../../../src/domain/product/combo';
import { CARD_SHOP, CATEGORIES, P_COLA, P_COMBO, P_PASTA, P_SALAD } from '../../fixtures/orders';

const OWNER = {
  ok: true,
  actor: { actorType: 'owner', actorId: 'u1', role: 'owner' },
  permissions: ['manage_menu', 'manage_stock'],
};
const http = {} as any;
const PHOTO = { id: 'i1', url: 'https://x/i1.jpg', sortOrder: 0, createdAt: 'x' };
const dishBase = { shopId: 'shop-1', name: 'Margherita', description: 'Tomate', price: 900, categoryIds: ['pasta'] };
const comboBody = {
  name: 'Pasta-Menü',
  priceCents: 1200,
  categoryId: 'pasta',
  groups: [
    { name: 'Hauptgericht', productIds: ['p1', 'p3'] },
    { name: 'Getränk', productIds: ['p2'] },
  ],
};

const seed = (p: any) => (store.set(p.id, p), p);
const dish = (o: any = {}) => ({ ...P_PASTA, id: 'd1', categoryIds: ['pasta'], isAvailable: true, images: [PHOTO], ...o });
const combo = (o: any = {}) => ({ ...P_COMBO, id: 'c9', isAvailable: true, images: [PHOTO], ...o });

describe('photo is optional; turning on requires one', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    [P_PASTA, P_COLA, P_SALAD].forEach(seed);
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    (authorizeShopAction as any).mockResolvedValue(OWNER);
    (findCategoriesByShopId as any).mockResolvedValue(CATEGORIES);
    (getReferenceLists as any).mockResolvedValue(DE_REFERENCE_LISTS);
  });

  describe('dish create', () => {
    it('without isAvailable succeeds, with no photo and switched off', async () => {
      const r = await executeCreateProduct({ ...dishBase } as any, http);
      expect(r.ok && r.data.isAvailable).toBe(false);
      expect([...store.values()].find((p) => p.name === 'Margherita')).toMatchObject({ images: [], isAvailable: false });
    });
    it('with isAvailable:false succeeds', async () => {
      const r = await executeCreateProduct({ ...dishBase, isAvailable: false } as any, http);
      expect(r.ok && r.data.isAvailable).toBe(false);
    });
    it('with isAvailable:true is refused 409 PRODUCT_IMAGE_REQUIRED_TO_ENABLE and stores nothing', async () => {
      const r = await executeCreateProduct({ ...dishBase, isAvailable: true } as any, http);
      expect(r).toMatchObject({ ok: false, code: PRODUCT_IMAGE_REQUIRED_TO_ENABLE, error: DISH_ENABLE_NEEDS_PHOTO_ERROR, errorCode: 'PRODUCT_IMAGE_REQUIRED_TO_ENABLE' });
      expect(DISH_ENABLE_NEEDS_PHOTO_ERROR).toContain("can't be turned on without a photo");
      expect([...store.values()].some((p) => p.name === 'Margherita')).toBe(false);
    });
  });

  describe('dish update', () => {
    it('removing the last photo while the dish stays on is refused 409 PRODUCT_IMAGE_REQUIRED', async () => {
      seed(dish());
      const r = await executeUpdateProduct({ shopId: 'shop-1', productId: 'd1', images: [] } as any, http);
      expect(r).toMatchObject({ ok: false, code: PRODUCT_IMAGE_REQUIRED, error: DISH_LEAVES_ON_WITHOUT_PHOTO_ERROR, errorCode: 'PRODUCT_IMAGE_REQUIRED' });
      expect(DISH_LEAVES_ON_WITHOUT_PHOTO_ERROR).toContain('would leave an available dish with no photo');
      expect(store.get('d1').images).toHaveLength(1);
    });
    it('removing the last photo with isAvailable:true in the same request is refused as TO_ENABLE', async () => {
      seed(dish());
      const r = await executeUpdateProduct({ shopId: 'shop-1', productId: 'd1', images: [], isAvailable: true } as any, http);
      expect(r).toMatchObject({ ok: false, code: PRODUCT_IMAGE_REQUIRED_TO_ENABLE });
    });
    it('removing the last photo and switching off in the same request succeeds', async () => {
      seed(dish());
      const r = await executeUpdateProduct({ shopId: 'shop-1', productId: 'd1', images: [], isAvailable: false } as any, http);
      expect(r.ok).toBe(true);
      expect(store.get('d1')).toMatchObject({ images: [], isAvailable: false });
    });
    it('turning on a photo-less dish is refused TO_ENABLE; keeping a photo while on is fine', async () => {
      seed(dish({ images: [], isAvailable: false }));
      const refused = await executeUpdateProduct({ shopId: 'shop-1', productId: 'd1', isAvailable: true } as any, http);
      expect(refused).toMatchObject({ ok: false, code: PRODUCT_IMAGE_REQUIRED_TO_ENABLE });
      seed(dish());
      const ok = await executeUpdateProduct({ shopId: 'shop-1', productId: 'd1', price: 950 } as any, http);
      expect(ok.ok).toBe(true);
    });
    it('a photo-less dish that is off can be edited', async () => {
      seed(dish({ images: [], isAvailable: false }));
      const r = await executeUpdateProduct({ shopId: 'shop-1', productId: 'd1', price: 950 } as any, http);
      expect(r.ok).toBe(true);
    });
    it('both guards compose: no categories and no photo is still refused (photo guard first)', async () => {
      seed(dish({ images: [], isAvailable: false, categoryIds: [] }));
      const r = await executeUpdateProduct({ shopId: 'shop-1', productId: 'd1', isAvailable: true } as any, http);
      expect(r).toMatchObject({ ok: false, code: PRODUCT_IMAGE_REQUIRED_TO_ENABLE });
      seed(dish({ categoryIds: [], isAvailable: false }));
      const r2 = await executeUpdateProduct({ shopId: 'shop-1', productId: 'd1', isAvailable: true } as any, http);
      expect(r2).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    });
  });

  describe('updateProductAvailability', () => {
    const toggle = (isAvailable: boolean, id = 'd1') =>
      executeUpdateProductAvailability({ shopId: 'shop-1', productId: id, isAvailable }, http);
    it('turning on a photo-less dish is refused 409 PRODUCT_IMAGE_REQUIRED_TO_ENABLE', async () => {
      seed(dish({ images: [], isAvailable: false }));
      expect(await toggle(true)).toMatchObject({ ok: false, code: PRODUCT_IMAGE_REQUIRED_TO_ENABLE, error: DISH_ENABLE_NEEDS_PHOTO_ERROR, errorCode: 'PRODUCT_IMAGE_REQUIRED_TO_ENABLE' });
      expect(store.get('d1').isAvailable).toBe(false);
    });
    it('turning on a dish with a photo succeeds', async () => {
      seed(dish({ isAvailable: false }));
      expect((await toggle(true)).ok).toBe(true);
      expect(store.get('d1').isAvailable).toBe(true);
    });
    it('turning off a photo-less dish succeeds', async () => {
      seed(dish({ images: [], isAvailable: true }));
      expect((await toggle(false)).ok).toBe(true);
      expect(store.get('d1').isAvailable).toBe(false);
    });
    it('turning on a photo-less combo is refused 409 COMBO_IMAGE_REQUIRED_TO_ENABLE', async () => {
      seed(combo({ images: [], isAvailable: false }));
      expect(await toggle(true, 'c9')).toMatchObject({ ok: false, code: COMBO_IMAGE_REQUIRED_TO_ENABLE, error: COMBO_ENABLE_NEEDS_PHOTO_ERROR, errorCode: 'COMBO_IMAGE_REQUIRED_TO_ENABLE' });
    });
  });

  describe('combo create', () => {
    it('without isAvailable succeeds, no photo, switched off', async () => {
      const r = await executeCreateCombo({ shopId: 'shop-1', body: comboBody }, http);
      expect(r.ok && r.data.isAvailable).toBe(false);
      expect([...store.values()].find((p) => p.name === 'Pasta-Menü')).toMatchObject({ images: [], isAvailable: false });
    });
    it('with isAvailable:false succeeds', async () => {
      expect((await executeCreateCombo({ shopId: 'shop-1', body: { ...comboBody, isAvailable: false } }, http)).ok).toBe(true);
    });
    it('with isAvailable:true is refused 409 COMBO_IMAGE_REQUIRED_TO_ENABLE', async () => {
      const r = await executeCreateCombo({ shopId: 'shop-1', body: { ...comboBody, isAvailable: true } }, http);
      expect(r).toMatchObject({ ok: false, code: COMBO_IMAGE_REQUIRED_TO_ENABLE, error: COMBO_ENABLE_NEEDS_PHOTO_ERROR, errorCode: 'COMBO_IMAGE_REQUIRED_TO_ENABLE' });
      expect(COMBO_ENABLE_NEEDS_PHOTO_ERROR).toContain("can't be turned on without a photo");
      expect([...store.values()].some((p) => p.name === 'Pasta-Menü')).toBe(false);
    });
  });

  describe('combo update (PUT)', () => {
    const put = (extra: object, id = 'c9') => executeUpdateCombo({ shopId: 'shop-1', comboId: id, body: { ...comboBody, ...extra } }, http);
    it('turning on a photo-less combo is refused COMBO_IMAGE_REQUIRED_TO_ENABLE', async () => {
      seed(combo({ images: [], isAvailable: false }));
      expect(await put({ isAvailable: true })).toMatchObject({ ok: false, code: COMBO_IMAGE_REQUIRED_TO_ENABLE, error: COMBO_ENABLE_NEEDS_PHOTO_ERROR, errorCode: 'COMBO_IMAGE_REQUIRED_TO_ENABLE' });
    });
    it('leaving isAvailable out keeps a photo-less combo off and saves', async () => {
      seed(combo({ images: [], isAvailable: false }));
      const r = await put({});
      expect(r.ok && r.data.isAvailable).toBe(false);
    });
    it('an already-on photo-less combo cannot be saved while on, but can be saved with isAvailable:false', async () => {
      seed(combo({ images: [], isAvailable: true }));
      expect(await put({})).toMatchObject({ ok: false, code: COMBO_IMAGE_REQUIRED_TO_ENABLE, error: COMBO_LEAVES_ON_WITHOUT_PHOTO_ERROR, errorCode: 'COMBO_IMAGE_REQUIRED_TO_ENABLE' });
      expect((await put({ isAvailable: false })).ok).toBe(true);
    });
    it('a combo with a photo can be turned on and saved', async () => {
      seed(combo({ isAvailable: false }));
      const r = await put({ isAvailable: true });
      expect(r.ok && r.data.isAvailable).toBe(true);
    });
  });

  describe('combo via the generic product update (photo removal)', () => {
    it('removing the last photo while on is refused with the combo code', async () => {
      seed(combo());
      const r = await executeUpdateProduct({ shopId: 'shop-1', productId: 'c9', images: [] } as any, http);
      expect(r).toMatchObject({ ok: false, code: COMBO_IMAGE_REQUIRED_TO_ENABLE, error: COMBO_LEAVES_ON_WITHOUT_PHOTO_ERROR, errorCode: 'COMBO_IMAGE_REQUIRED_TO_ENABLE' });
    });
    it('removing it with isAvailable:false succeeds', async () => {
      seed(combo());
      const r = await executeUpdateProduct({ shopId: 'shop-1', productId: 'c9', images: [], isAvailable: false } as any, http);
      expect(r.ok).toBe(true);
    });
  });

  it('maps all three codes to 409 { error, code }', () => {
    for (const code of [PRODUCT_IMAGE_REQUIRED, PRODUCT_IMAGE_REQUIRED_TO_ENABLE, COMBO_IMAGE_REQUIRED_TO_ENABLE]) {
      const res = mapResultToHttp({ ok: false, code, error: 'msg' } as any);
      expect(res.status).toBe(409);
      expect(res.jsonBody).toEqual({ error: 'msg', code });
    }
  });

  it('storefront regression: after any sequence of guarded writes, no available item in the catalog lacks an image', async () => {
    seed(dish({ id: 'd2' }));
    seed(combo());
    const attempts: Array<() => Promise<unknown>> = [
      () => executeCreateProduct({ ...dishBase, isAvailable: true } as any, http),
      () => executeCreateProduct({ ...dishBase } as any, http),
      () => executeCreateCombo({ shopId: 'shop-1', body: { ...comboBody, isAvailable: true } }, http),
      () => executeCreateCombo({ shopId: 'shop-1', body: comboBody }, http),
      () => executeUpdateProduct({ shopId: 'shop-1', productId: 'd2', images: [] } as any, http),
      () => executeUpdateProduct({ shopId: 'shop-1', productId: 'c9', images: [] } as any, http),
      () => executeUpdateProductAvailability({ shopId: 'shop-1', productId: 'd2', isAvailable: true }, http),
    ];
    for (const a of attempts) await a();
    // The seeded fixtures p1-p3 are untouched legacy rows; only what the guarded writes produced is checked.
    const written = [...store.values()].filter((p) => !['p1', 'p2', 'p3'].includes(p.id));
    for (const p of written) {
      if (p.isAvailable) expect((p.images ?? []).length, `${p.name} is on without a photo`).toBeGreaterThan(0);
    }
    const catalog = buildCatalog({
      shop: CARD_SHOP as any,
      categories: CATEGORIES as any,
      products: written,
      refs: DE_REFERENCE_LISTS,
      lang: 'de',
      now: new Date('2026-10-09T10:00:00Z'),
    });
    const shown = catalog.categories.flatMap((c) => c.products);
    expect(shown.length).toBeGreaterThan(0);
    for (const p of shown) if (p.isAvailable) expect(p.images.length).toBeGreaterThan(0);
  });
});
