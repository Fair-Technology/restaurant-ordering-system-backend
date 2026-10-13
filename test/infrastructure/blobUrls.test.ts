import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ownedBlobPath, productImageFolder, shopBrandingFolder } from '../../src/infrastructure/storage/blobUrls';

const BASE = 'https://acct.blob.core.windows.net/product-media/';
const F = 'shops/shop-1/products/prod-1/';

describe('blobUrls', () => {
  beforeEach(() => vi.stubEnv('STORAGE_ACCOUNT_NAME', 'acct'));
  afterEach(() => vi.unstubAllEnvs());

  it('returns the path for an own link in the folder', () => {
    for (const ext of ['jpg', 'png', 'webp']) {
      expect(ownedBlobPath(`${BASE}${F}img-1.${ext}`, F)).toBe(`${F}img-1.${ext}`);
    }
  });

  it('refuses links outside the folder or our storage', () => {
    const bad: unknown[] = [
      BASE + 'shops/shop-2/products/prod-1/img-1.jpg',
      BASE + 'shops/shop-1/products/prod-2/img-1.jpg',
      'https://evil.example/product-media/' + F + 'img-1.jpg',
      'http://acct.blob.core.windows.net/product-media/' + F + 'img-1.jpg',
      'https://acct.blob.core.windows.net.evil.example/product-media/' + F + 'img-1.jpg',
      BASE + F + '../../prod-2/a.jpg',
      BASE + F + '%2e%2e/a.jpg',
      BASE + F + 'img-1.jpg?sv=1',
      BASE + F + 'img-1.jpg#x',
      BASE + F + 'sub/img-1.jpg',
      BASE + F + 'img-1.gif',
      'https://images.unsplash.com/photo-1?w=800',
      undefined,
    ];
    for (const u of bad) expect(ownedBlobPath(u, F)).toBeNull();
  });

  it('refuses everything when the account name is unset', () => {
    vi.stubEnv('STORAGE_ACCOUNT_NAME', '');
    expect(ownedBlobPath(BASE + F + 'img-1.jpg', F)).toBeNull();
  });

  it('folder helpers', () => {
    expect(productImageFolder('shop-1', 'prod-1')).toBe('shops/shop-1/products/prod-1/');
    expect(shopBrandingFolder('shop-1')).toBe('shops/shop-1/branding/');
  });
});
