import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({ authorizeShopAction: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({
  findProductById: vi.fn(),
  updateProduct: vi.fn(async (p: any) => p),
}));
vi.mock('../../../src/infrastructure/storage/blobImageSize', () => ({ readBlobImageSize: vi.fn() }));
vi.mock('../../../src/infrastructure/storage/blobStorageHelpers', () => ({
  deleteBlob: vi.fn(async () => {}),
  extractBlobPath: (u: string) => {
    const m = '/product-media/';
    const i = u.indexOf(m);
    return i === -1 ? null : u.slice(i + m.length);
  },
}));

import { executeAddProductImage } from '../../../src/application/product/addProductImage/executeAddProductImage';
import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { findProductById, updateProduct } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { readBlobImageSize } from '../../../src/infrastructure/storage/blobImageSize';
import { deleteBlob } from '../../../src/infrastructure/storage/blobStorageHelpers';

const BASE = 'https://acct.blob.core.windows.net/product-media/';
const path = 'shops/shop-1/products/prod-1/img-1.jpg';
const req = { shopId: 'shop-1', productId: 'prod-1', imageId: 'img-1', url: BASE + path };
const httpRequest = {} as any;

let product: any;
beforeEach(() => {
  vi.clearAllMocks();
  product = { id: 'prod-1', shopId: 'shop-1', images: [{ id: 'old', url: BASE + 'shops/shop-1/products/prod-1/old.jpg', createdAt: 'x' }] };
  vi.mocked(findShopById).mockResolvedValue({ id: 'shop-1' } as any);
  vi.mocked(authorizeShopAction).mockResolvedValue({ ok: true } as any);
  vi.mocked(findProductById).mockImplementation(async () => product);
  vi.mocked(readBlobImageSize).mockResolvedValue({ status: 'ok', size: { width: 1200, height: 900 } });
});

describe('addProductImage exact pixel size', () => {
  it('accepts exactly 1200 x 900 and saves the photo', async () => {
    const r = await executeAddProductImage(req, httpRequest);
    expect(r.ok).toBe(true);
    expect(readBlobImageSize).toHaveBeenCalledWith(path);
    expect(updateProduct).toHaveBeenCalledTimes(1);
    expect(deleteBlob).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong ratio', { width: 1000, height: 1000 }],
    ['right ratio, wrong size', { width: 800, height: 600 }],
    ['right ratio, too big', { width: 2400, height: 1800 }],
  ])('rejects %s, deletes the blob, leaves the dish unchanged', async (_n, size) => {
    vi.mocked(readBlobImageSize).mockResolvedValue({ status: 'ok', size });
    const r = await executeAddProductImage(req, httpRequest);
    expect(r).toEqual({ ok: false, code: 'PRODUCT_IMAGE_WRONG_SIZE', error: 'Dish photo must be exactly 1200 x 900 px' });
    expect(deleteBlob).toHaveBeenCalledWith(path);
    expect(updateProduct).not.toHaveBeenCalled();
    expect(product.images).toHaveLength(1);
  });

  it('rejects an unreadable file the same way', async () => {
    vi.mocked(readBlobImageSize).mockResolvedValue({ status: 'unreadable' });
    const r = await executeAddProductImage(req, httpRequest);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('PRODUCT_IMAGE_WRONG_SIZE');
    expect(deleteBlob).toHaveBeenCalledWith(path);
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('refuses a URL that is not in this dish folder, without reading or deleting anything', async () => {
    for (const url of [
      BASE + 'shops/shop-2/products/prod-1/img-1.jpg',
      BASE + 'shops/shop-1/products/prod-2/img-1.jpg',
      BASE + 'shops/shop-1/products/prod-1/../../branding/logo.png',
      'https://evil.example/x.jpg',
    ]) {
      const r = await executeAddProductImage({ ...req, url }, httpRequest);
      expect(r).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    }
    expect(readBlobImageSize).not.toHaveBeenCalled();
    expect(deleteBlob).not.toHaveBeenCalled();
  });

  it('a duplicate image id is refused without touching the existing blob', async () => {
    const r = await executeAddProductImage({ ...req, imageId: 'old', url: BASE + 'shops/shop-1/products/prod-1/old.jpg' }, httpRequest);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(deleteBlob).not.toHaveBeenCalled();
  });
});
