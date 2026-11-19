import { describe, expect, it } from 'vitest';
import type { Product } from '../../src/domain/product/Product';
import { findExternalImages } from '../../scripts/migrateMapastaImagesToBlob';

const img = (id: string, url: string) => ({ id, url, createdAt: '2026-01-01T00:00:00.000Z' });
const product = (id: string, images?: { id: string; url: string; createdAt: string }[]) =>
  ({ id, shopId: 's1', name: id, images }) as unknown as Product;

describe('findExternalImages', () => {
  it('selects only www.mapasta.de images, host case-insensitive', () => {
    const r = findExternalImages([
      product('p1', [
        img('a', 'https://www.mapasta.de/wp-content/uploads/2026/01/IMG_1163.jpeg'),
        img('b', 'https://WWW.MaPasta.DE/wp-content/uploads/2017/11/IMG_0775.jpeg'),
      ]),
    ]);
    expect(r.map((x) => x.imageId)).toEqual(['a', 'b']);
  });

  it('ignores our own blob and unsplash URLs', () => {
    expect(
      findExternalImages([
        product('p1', [
          img('a', 'https://restaurantordsysdev.blob.core.windows.net/product-media/shops/s1/products/p1/a.jpg'),
          img('b', 'https://images.unsplash.com/photo-1?w=800'),
        ]),
      ]),
    ).toEqual([]);
  });

  it('ignores products with no images or no external images', () => {
    expect(findExternalImages([product('p1'), product('p2', []), product('p3', [img('a', 'not a url')])])).toEqual([]);
  });

  it('returns one entry per offending image with productId and imageId', () => {
    const r = findExternalImages([
      product('p1', [img('a', 'https://www.mapasta.de/x.jpg'), img('b', 'https://images.unsplash.com/y')]),
      product('p2', [img('c', 'https://www.mapasta.de/z.jpg'), img('d', 'https://www.mapasta.de/w.jpg')]),
    ]);
    expect(r).toEqual([
      { productId: 'p1', imageId: 'a', url: 'https://www.mapasta.de/x.jpg' },
      { productId: 'p2', imageId: 'c', url: 'https://www.mapasta.de/z.jpg' },
      { productId: 'p2', imageId: 'd', url: 'https://www.mapasta.de/w.jpg' },
    ]);
  });
});
