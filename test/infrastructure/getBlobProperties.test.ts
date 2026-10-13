import { describe, it, expect, vi, beforeEach } from 'vitest';

const getProperties = vi.hoisted(() => {
  process.env.STORAGE_ACCOUNT_NAME = 'testaccount';
  process.env.STORAGE_ACCOUNT_KEY = Buffer.from('test-key').toString('base64');
  return vi.fn();
});

vi.mock('@azure/storage-blob', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@azure/storage-blob')>();
  return {
    ...actual,
    BlobServiceClient: class {
      getContainerClient() {
        return { getBlockBlobClient: () => ({ getProperties }) };
      }
    },
  };
});

import { getBlobProperties } from '../../src/infrastructure/storage/blobStorageHelpers';

beforeEach(() => vi.clearAllMocks());

describe('getBlobProperties', () => {
  it('returns size and type', async () => {
    getProperties.mockResolvedValue({ contentLength: 1234, contentType: 'image/jpeg' });
    expect(await getBlobProperties('a/b.jpg')).toEqual({ contentLength: 1234, contentType: 'image/jpeg' });
  });
  it('missing type is null', async () => {
    getProperties.mockResolvedValue({ contentLength: 5 });
    expect(await getBlobProperties('a/b.jpg')).toEqual({ contentLength: 5, contentType: null });
  });
  it('missing blob is null', async () => {
    getProperties.mockRejectedValue(Object.assign(new Error('x'), { statusCode: 404 }));
    expect(await getBlobProperties('a/b.jpg')).toBeNull();
  });
  it('other failures pass on', async () => {
    getProperties.mockRejectedValue(Object.assign(new Error('x'), { statusCode: 403 }));
    await expect(getBlobProperties('a/b.jpg')).rejects.toThrow('x');
  });
});
