import { describe, expect, it } from 'vitest';
import type { Product } from '../../src/domain/product/Product';
import {
  findExternalImages,
  photoIdOf,
} from '../../scripts/migrateUnsplashImagesToBlob';

const img = (id: string, url: string) => ({
  id,
  url,
  createdAt: '2026-01-01T00:00:00.000Z',
});
const product = (
  id: string,
  images?: { id: string; url: string; createdAt: string }[],
) => ({ id, shopId: 's1', name: id, images }) as unknown as Product;

describe('findExternalImages', () => {
  it('selects only images.unsplash.com images, host case-insensitive', () => {
    const r = findExternalImages([
      product('p1', [
        img('a', 'https://images.unsplash.com/photo-1?w=800'),
        img('b', 'https://IMAGES.Unsplash.COM/photo-2?w=800'),
      ]),
    ]);
    expect(r.map((x) => x.imageId)).toEqual(['a', 'b']);
  });

  it('ignores our own blob and www.mapasta.de URLs', () => {
    expect(
      findExternalImages([
        product('p1', [
          img(
            'a',
            'https://restaurantordsysdev.blob.core.windows.net/product-media/shops/s1/products/p1/a.jpg',
          ),
          img('b', 'https://www.mapasta.de/x.jpg'),
        ]),
      ]),
    ).toEqual([]);
  });

  it('ignores products with no images or no external images', () => {
    expect(
      findExternalImages([
        product('p1'),
        product('p2', []),
        product('p3', [img('a', 'not a url')]),
      ]),
    ).toEqual([]);
  });

  it('returns one entry per offending image with productId, imageId and url', () => {
    const r = findExternalImages([
      product('p1', [
        img('a', 'https://images.unsplash.com/photo-x'),
        img('b', 'https://www.mapasta.de/y'),
      ]),
      product('p2', [
        img('c', 'https://images.unsplash.com/photo-z'),
        img('d', 'https://images.unsplash.com/photo-w'),
      ]),
    ]);
    expect(r).toEqual([
      {
        productId: 'p1',
        imageId: 'a',
        url: 'https://images.unsplash.com/photo-x',
      },
      {
        productId: 'p2',
        imageId: 'c',
        url: 'https://images.unsplash.com/photo-z',
      },
      {
        productId: 'p2',
        imageId: 'd',
        url: 'https://images.unsplash.com/photo-w',
      },
    ]);
  });
});

describe('photoIdOf', () => {
  it('extracts the id from a stored seed URL', () => {
    expect(
      photoIdOf(
        'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&auto=format&fit=crop',
      ),
    ).toBe('1513104890138-7c749659a591');
  });
});
