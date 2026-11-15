import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set the storage env before the module under test is imported (its module body requires it).
const h = vi.hoisted(() => {
  process.env.STORAGE_ACCOUNT_NAME = 'testaccount';
  process.env.STORAGE_ACCOUNT_KEY = Buffer.from('test-key').toString('base64');
  return {
    items: [] as { name: string }[],
    lastListOptions: undefined as { prefix?: string } | undefined,
    deleteIfExists: vi.fn(async (_name?: string) => true),
  };
});

vi.mock('@azure/storage-blob', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@azure/storage-blob')>();
  return {
    ...actual,
    BlobServiceClient: class {
      getContainerClient() {
        return {
          listBlobsFlat: (options?: { prefix?: string }) => {
            h.lastListOptions = options;
            return h.items;
          },
          getBlockBlobClient: (name: string) => ({ deleteIfExists: () => h.deleteIfExists(name) }),
        };
      }
    },
  };
});

import { deleteBlobsByPrefix, shopBlobPrefix } from '../../src/infrastructure/storage/blobStorageHelpers';

beforeEach(() => {
  h.items = [];
  h.lastListOptions = undefined;
  vi.clearAllMocks();
});

describe('shopBlobPrefix', () => {
  it('scopes to the shop id with a trailing slash, so shops/abc never matches shops/abcde', () => {
    expect(shopBlobPrefix('abc')).toBe('shops/abc/');
  });

  it('refuses a blank id — a prefix that is not one shop could delete another shop\u2019s blobs', () => {
    expect(() => shopBlobPrefix('')).toThrow();
    expect(() => shopBlobPrefix('   ')).toThrow();
  });
});

describe('deleteBlobsByPrefix', () => {
  it('deletes every listed blob and reports how many it removed', async () => {
    h.items = [
      { name: 'shops/abc/products/p1/a.jpg' },
      { name: 'shops/abc/branding/logo.png' },
    ];

    expect(await deleteBlobsByPrefix('shops/abc/')).toBe(2);
    expect(h.lastListOptions).toEqual({ prefix: 'shops/abc/' });
    expect(h.deleteIfExists).toHaveBeenCalledTimes(2);
    expect(h.deleteIfExists).toHaveBeenNthCalledWith(1, 'shops/abc/products/p1/a.jpg');
    expect(h.deleteIfExists).toHaveBeenNthCalledWith(2, 'shops/abc/branding/logo.png');
  });

  it('is a no-op when nothing matches the prefix', async () => {
    expect(await deleteBlobsByPrefix('shops/absent/')).toBe(0);
    expect(h.deleteIfExists).not.toHaveBeenCalled();
  });
});
