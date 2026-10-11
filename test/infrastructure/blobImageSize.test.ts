import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/infrastructure/storage/blobStorageHelpers', () => ({ downloadBlobRange: vi.fn() }));

import { readBlobImageSize } from '../../src/infrastructure/storage/blobImageSize';
import { downloadBlobRange } from '../../src/infrastructure/storage/blobStorageHelpers';
import { mapResultToHttp } from '../../src/functions/_shared/mapResultToHttp';
import { COVER_IMAGE_SIZE, PRODUCT_IMAGE_SIZE } from '../../src/domain/images/imageRules';

function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

beforeEach(() => vi.clearAllMocks());

describe('readBlobImageSize', () => {
  it('reads the real size from the first bytes only', async () => {
    vi.mocked(downloadBlobRange).mockResolvedValue(png(1920, 640));
    expect(await readBlobImageSize('a/b.png')).toEqual({ status: 'ok', size: { width: 1920, height: 640 } });
    expect(downloadBlobRange).toHaveBeenCalledTimes(1);
    expect(downloadBlobRange).toHaveBeenCalledWith('a/b.png', 0, 64 * 1024);
  });

  it('reports a missing blob', async () => {
    vi.mocked(downloadBlobRange).mockResolvedValue(null);
    expect(await readBlobImageSize('a/b.png')).toEqual({ status: 'missing' });
  });

  it('reports non-image bytes as unreadable after reading the whole small file once', async () => {
    vi.mocked(downloadBlobRange).mockResolvedValue(Buffer.from('not an image at all'));
    expect(await readBlobImageSize('a/b.png')).toEqual({ status: 'unreadable' });
    expect(downloadBlobRange).toHaveBeenCalledTimes(1);
  });

  it('falls back to a bigger range when the header is not in the first one', async () => {
    vi.mocked(downloadBlobRange)
      .mockResolvedValueOnce(Buffer.alloc(64 * 1024, 1))
      .mockResolvedValueOnce(png(1200, 900));
    expect(await readBlobImageSize('a/b.png')).toEqual({ status: 'ok', size: { width: 1200, height: 900 } });
    expect(downloadBlobRange).toHaveBeenLastCalledWith('a/b.png', 0, 512 * 1024);
  });
});

describe('image rules and HTTP shape', () => {
  it('sizes', () => {
    expect(COVER_IMAGE_SIZE).toEqual({ width: 1920, height: 640 });
    expect(PRODUCT_IMAGE_SIZE).toEqual({ width: 1200, height: 900 });
  });

  it.each(['COVER_IMAGE_WRONG_SIZE', 'PRODUCT_IMAGE_WRONG_SIZE'])('%s answers 400 with { error, code }', (code) => {
    expect(mapResultToHttp({ ok: false, code, error: 'msg' })).toEqual({ status: 400, jsonBody: { error: 'msg', code } });
  });
});
