import { describe, it, expect, vi, beforeEach } from 'vitest';

const uploadData = vi.hoisted(() => {
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
        return { getBlockBlobClient: () => ({ uploadData }) };
      }
    },
  };
});

import { uploadBlob } from '../../src/infrastructure/storage/blobStorageHelpers';

beforeEach(() => vi.clearAllMocks());

describe('uploadBlob', () => {
  it('stores the content type and an immutable one-year Cache-Control', async () => {
    uploadData.mockResolvedValue({});
    const bytes = Buffer.from('img');
    await uploadBlob('a/b.jpg', bytes, 'image/jpeg');
    expect(uploadData).toHaveBeenCalledWith(bytes, {
      blobHTTPHeaders: { blobContentType: 'image/jpeg', blobCacheControl: 'public, max-age=31536000, immutable' },
    });
  });
});
