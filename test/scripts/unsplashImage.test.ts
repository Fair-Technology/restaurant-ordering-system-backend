import { describe, expect, it, vi } from 'vitest';
import {
  storeUnsplashImage,
  unsplashDownloadUrl,
  type UnsplashImageDeps,
} from '../../scripts/unsplashImage';

const BLOB_HOST = 'https://example.blob.core.windows.net/product-media/';
const args = {
  photoId: 'abc-123',
  label: 'Big Breakfast',
  shopId: 's1',
  productId: 'p1',
  imageId: 'i1',
};

function deps(over: Partial<UnsplashImageDeps> = {}): UnsplashImageDeps {
  return {
    download: vi.fn().mockResolvedValue(Buffer.from('raw')),
    normalize: vi
      .fn()
      .mockResolvedValue({ status: 'ok', bytes: Buffer.from('jpeg') }),
    upload: vi.fn().mockResolvedValue(undefined),
    blobPath: (s, p, i, e) => `shops/${s}/products/${p}/${i}${e}`,
    blobUrl: (path) => `${BLOB_HOST}${path}`,
    ...over,
  };
}

describe('storeUnsplashImage', () => {
  it('uploads the normalised bytes and returns the blob URL, never an unsplash URL', async () => {
    const d = deps();
    const url = await storeUnsplashImage(args, d);
    expect(url).toBe(`${BLOB_HOST}shops/s1/products/p1/i1.jpg`);
    expect(url).not.toContain('images.unsplash.com');
    expect(d.download).toHaveBeenCalledWith(unsplashDownloadUrl('abc-123'));
    expect(d.upload).toHaveBeenCalledWith(
      'shops/s1/products/p1/i1.jpg',
      Buffer.from('jpeg'),
      'image/jpeg',
    );
  });

  it('rejects, naming dish and photo id, when the download fails (e.g. HTTP 404)', async () => {
    const d = deps({
      download: vi.fn().mockRejectedValue(new Error('HTTP 404')),
    });
    await expect(storeUnsplashImage(args, d)).rejects.toThrow(
      /abc-123.*Big Breakfast.*HTTP 404/,
    );
    expect(d.upload).not.toHaveBeenCalled();
  });

  it.each(['too_small', 'unsupported'] as const)(
    'rejects when normalizeImage reports %s',
    async (status) => {
      const d = deps({ normalize: vi.fn().mockResolvedValue({ status }) });
      await expect(storeUnsplashImage(args, d)).rejects.toThrow(
        new RegExp(`abc-123.*${status}`),
      );
      expect(d.upload).not.toHaveBeenCalled();
    },
  );

  it('downloads a photo used twice only once but uploads per image', async () => {
    const d = deps();
    const cache = new Map();
    await storeUnsplashImage(args, d, cache);
    await storeUnsplashImage(
      { ...args, productId: 'p2', imageId: 'i2' },
      d,
      cache,
    );
    expect(d.download).toHaveBeenCalledTimes(1);
    expect(d.upload).toHaveBeenCalledTimes(2);
  });
});
