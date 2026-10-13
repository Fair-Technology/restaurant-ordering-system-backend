import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const store = vi.hoisted(() => ({ product: null as any }));

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(async () => ({ ok: true, actor: { actorType: 'owner', actorId: 'u1' }, permissions: ['manage_menu'] })),
  toAuditActor: (actor: any) => ({ actorType: actor.actorType, actorId: actor.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(async () => ({ id: 'shop-1', countryCode: 'DE', members: [] })),
}));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({
  findCategoriesByShopId: vi.fn(async () => [{ id: 'c1', shopId: 'shop-1', isDeleted: false, taxClassId: 'food' }]),
}));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({
  createProduct: vi.fn(async (p: any) => (store.product = p)),
  updateProduct: vi.fn(async (p: any) => (store.product = p)),
  findProductById: vi.fn(async () => store.product),
}));
vi.mock('../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository', () => ({
  getReferenceLists: vi.fn(),
}));
vi.mock('../../../src/infrastructure/storage/blobStorageHelpers', () => ({
  deleteBlob: vi.fn(async () => undefined),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({
  logAudit: vi.fn(),
  diffFields: vi.fn(() => []),
}));

import { getReferenceLists } from '../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository';
import { createProduct, updateProduct } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { deleteBlob } from '../../../src/infrastructure/storage/blobStorageHelpers';
import { executeCreateProduct } from '../../../src/application/product/createProduct/executeCreateProduct';
import { executeUpdateProduct } from '../../../src/application/product/updateProduct/executeUpdateProduct';
import { executeDeleteProduct } from '../../../src/application/product/deleteProduct/executeDeleteProduct';
import { DE_REFERENCE_LISTS } from '../../../src/domain/reference/ReferenceLists';
import {
  CREATE_WITH_PHOTOS_ERROR,
  PHOTO_NOT_UPLOADED_ERROR,
  PHOTO_URL_CHANGED_ERROR,
} from '../../../src/domain/images/imageRules';

const BASE = 'https://acct.blob.core.windows.net/product-media/';
const OWN = BASE + 'shops/shop-1/products/p1/own.jpg';
const OLD = BASE + 'shops/shop-1/products/p1/old.jpg';
const VICTIM = BASE + 'shops/shop-VICTIM/products/pv/photo.jpg';
const SIBLING = BASE + 'shops/shop-1/products/p2/x.jpg';
const UNSPLASH = 'https://images.unsplash.com/photo-1?w=800';
const http = {} as any;

function stored(images: any[]) {
  return {
    id: 'p1',
    shopId: 'shop-1',
    name: 'Margherita',
    description: 'x',
    price: 900,
    categoryIds: ['c1'],
    images,
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
  };
}
const img = (id: string, url: string) => ({ id, url, createdAt: 'x' });
const createReq = (images: any) =>
  ({ shopId: 'shop-1', name: 'X', description: 'x', price: 100, categoryIds: ['c1'], images }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STORAGE_ACCOUNT_NAME', 'acct');
  vi.mocked(getReferenceLists).mockResolvedValue(DE_REFERENCE_LISTS);
  store.product = null;
});
afterEach(() => vi.unstubAllEnvs());

describe('photo ownership', () => {
  it("create refuses another shop's photo link", async () => {
    const r = await executeCreateProduct(createReq([{ id: 'i1', url: VICTIM, createdAt: 'x' }]), http);
    expect(r).toEqual({ ok: false, code: 'INVALID_INPUT', error: CREATE_WITH_PHOTOS_ERROR });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it('create refuses an external photo link (menu import)', async () => {
    const r = await executeCreateProduct(createReq([{ id: 'i1', url: UNSPLASH, createdAt: 'x' }]), http);
    expect(r).toEqual({ ok: false, code: 'INVALID_INPUT', error: CREATE_WITH_PHOTOS_ERROR });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it('create without photos still works', async () => {
    const r = await executeCreateProduct(createReq([]), http);
    expect(r.ok).toBe(true);
    expect(store.product.images).toEqual([]);
  });

  it('update refuses adding a photo by link', async () => {
    store.product = stored([img('own', OWN)]);
    const r = await executeUpdateProduct(
      { productId: 'p1', shopId: 'shop-1', images: [{ id: 'own', url: OWN }, { id: 'evil', url: VICTIM }] } as any,
      http,
    );
    expect(r).toEqual({ ok: false, code: 'INVALID_INPUT', error: PHOTO_NOT_UPLOADED_ERROR });
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it("update refuses changing a stored photo's link", async () => {
    store.product = stored([img('own', OWN)]);
    const r = await executeUpdateProduct({ productId: 'p1', shopId: 'shop-1', images: [{ id: 'own', url: VICTIM }] } as any, http);
    expect(r).toEqual({ ok: false, code: 'INVALID_INPUT', error: PHOTO_URL_CHANGED_ERROR });
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('replace flow: keeps the new photo, deletes the old one from this dish folder', async () => {
    store.product = stored([img('old', OLD), img('own', OWN)]);
    const r = await executeUpdateProduct({ productId: 'p1', shopId: 'shop-1', images: [{ id: 'own', url: OWN }] } as any, http);
    expect(r.ok).toBe(true);
    expect(deleteBlob).toHaveBeenCalledTimes(1);
    expect(deleteBlob).toHaveBeenCalledWith('shops/shop-1/products/p1/old.jpg');
  });

  it('update never deletes a stored photo outside this dish folder', async () => {
    store.product = stored([img('own', OWN), img('planted', VICTIM), img('sib', SIBLING), img('u', UNSPLASH)]);
    const r = await executeUpdateProduct({ productId: 'p1', shopId: 'shop-1', images: [{ id: 'own', url: OWN }] } as any, http);
    expect(r.ok).toBe(true);
    expect(deleteBlob).not.toHaveBeenCalled();
  });

  it('a seeded external photo can be sent back unchanged', async () => {
    store.product = stored([img('u', UNSPLASH)]);
    const r = await executeUpdateProduct({ productId: 'p1', shopId: 'shop-1', images: [{ id: 'u', url: UNSPLASH }] } as any, http);
    expect(r.ok).toBe(true);
  });

  it('deleting a dish deletes only its own photos', async () => {
    store.product = stored([img('own', OWN), img('planted', VICTIM), img('sib', SIBLING), img('u', UNSPLASH)]);
    const r = await executeDeleteProduct({ productId: 'p1', shopId: 'shop-1' } as any, http);
    expect(r.ok).toBe(true);
    expect(deleteBlob).toHaveBeenCalledTimes(1);
    expect(deleteBlob).toHaveBeenCalledWith('shops/shop-1/products/p1/own.jpg');
  });
});
