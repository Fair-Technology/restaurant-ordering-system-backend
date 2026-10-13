import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/storage/blobStorageHelpers', () => ({
  deleteBlob: vi.fn(async () => {}),
  getBlobProperties: vi.fn(),
}));
vi.mock('../../../src/infrastructure/storage/blobImageSize', () => ({ readBlobImageSize: vi.fn() }));

import { deleteBlob, getBlobProperties } from '../../../src/infrastructure/storage/blobStorageHelpers';
import { readBlobImageSize } from '../../../src/infrastructure/storage/blobImageSize';
import { verifyUploadedImageSize } from '../../../src/application/_shared/verifyUploadedImageSize';

const P = 'shops/s1/products/p1/img.jpg';
const SIZE = { width: 1200, height: 900 };
const run = (path = P) => verifyUploadedImageSize(path, SIZE, 'Dish photo', 'PRODUCT_IMAGE_WRONG_SIZE');
const WRONG_TYPE = { ok: false, code: 'INVALID_INPUT', error: 'Dish photo must be a JPEG, PNG or WebP image' };

beforeEach(() => vi.clearAllMocks());

describe('verifyUploadedImageSize', () => {
  it('missing upload', async () => {
    vi.mocked(getBlobProperties).mockResolvedValue(null);
    expect(await run()).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'Dish photo was not found - upload it first' });
    expect(readBlobImageSize).not.toHaveBeenCalled();
    expect(deleteBlob).not.toHaveBeenCalled();
  });

  it('too large is refused and deleted', async () => {
    vi.mocked(getBlobProperties).mockResolvedValue({ contentLength: 10485761, contentType: 'image/jpeg' });
    expect(await run()).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'Dish photo must be at most 10 MB' });
    expect(deleteBlob).toHaveBeenCalledWith(P);
    expect(readBlobImageSize).not.toHaveBeenCalled();
  });

  it('exactly 10 MB is fine', async () => {
    vi.mocked(getBlobProperties).mockResolvedValue({ contentLength: 10485760, contentType: 'image/jpeg' });
    vi.mocked(readBlobImageSize).mockResolvedValue({ status: 'ok', size: SIZE, format: 'jpg' });
    expect(await run()).toBeNull();
    expect(deleteBlob).not.toHaveBeenCalled();
  });

  it('declared type must match the extension', async () => {
    for (const contentType of ['text/html', 'image/png', null]) {
      vi.mocked(deleteBlob).mockClear();
      vi.mocked(getBlobProperties).mockResolvedValue({ contentLength: 1000, contentType });
      expect(await run()).toEqual(WRONG_TYPE);
      expect(deleteBlob).toHaveBeenCalledWith(P);
    }
  });

  it('first bytes must match the extension', async () => {
    vi.mocked(getBlobProperties).mockResolvedValue({ contentLength: 1000, contentType: 'image/jpeg' });
    vi.mocked(readBlobImageSize).mockResolvedValue({ status: 'ok', size: SIZE, format: 'svg' });
    expect(await run()).toEqual(WRONG_TYPE);
    expect(deleteBlob).toHaveBeenCalledWith(P);
  });

  it('unknown extension is refused', async () => {
    vi.mocked(getBlobProperties).mockResolvedValue({ contentLength: 1000, contentType: 'image/gif' });
    expect(await run('shops/s1/products/p1/img.gif')).toEqual(WRONG_TYPE);
  });

  it('png on a png path passes', async () => {
    vi.mocked(getBlobProperties).mockResolvedValue({ contentLength: 1000, contentType: 'image/png' });
    vi.mocked(readBlobImageSize).mockResolvedValue({ status: 'ok', size: SIZE, format: 'png' });
    expect(await run('shops/s1/products/p1/img.png')).toBeNull();
  });

  it('unreadable keeps the wrong-size code', async () => {
    vi.mocked(getBlobProperties).mockResolvedValue({ contentLength: 1000, contentType: 'image/jpeg' });
    vi.mocked(readBlobImageSize).mockResolvedValue({ status: 'unreadable' });
    expect(await run()).toEqual({ ok: false, code: 'PRODUCT_IMAGE_WRONG_SIZE', error: 'Dish photo must be exactly 1200 x 900 px' });
  });
});
