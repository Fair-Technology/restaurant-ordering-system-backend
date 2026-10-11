import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

const download = vi.hoisted(() => {
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
        return { getBlockBlobClient: () => ({ download }) };
      }
    },
  };
});

import { downloadBlobRange } from '../../src/infrastructure/storage/blobStorageHelpers';

function storageError(statusCode: number): Error {
  return Object.assign(new Error(`status ${statusCode}`), { statusCode });
}

beforeEach(() => vi.clearAllMocks());

describe('downloadBlobRange', () => {
  // A plain 1920 x 640 crop can be ~55 KB, shorter than the 64 KB first range. Azure then
  // answers with what the file has; that must come back, not an error (it used to be a 500).
  it('returns the whole file when it is shorter than the range asked for', async () => {
    const file = Buffer.alloc(55_970, 7);
    download.mockResolvedValue({ readableStreamBody: Readable.from([file.subarray(0, 30_000), file.subarray(30_000)]) });

    const bytes = await downloadBlobRange('shops/s/branding/x.jpg', 0, 64 * 1024);

    expect(download).toHaveBeenCalledWith(0, 64 * 1024);
    expect(bytes?.length).toBe(55_970);
    expect(bytes?.equals(file)).toBe(true);
  });

  it('returns null for a missing blob', async () => {
    download.mockRejectedValue(storageError(404));
    expect(await downloadBlobRange('a/b.jpg', 0, 1024)).toBeNull();
  });

  it('returns no bytes when the range starts past the end', async () => {
    download.mockRejectedValue(storageError(416));
    expect(await downloadBlobRange('a/b.jpg', 0, 1024)).toEqual(Buffer.alloc(0));
  });

  it('passes other storage failures on', async () => {
    download.mockRejectedValue(storageError(403));
    await expect(downloadBlobRange('a/b.jpg', 0, 1024)).rejects.toThrow('status 403');
  });
});
