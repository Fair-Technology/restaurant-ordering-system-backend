import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/storage/blobStorageHelpers', () => ({
  deleteBlob: vi.fn(async () => {}),
  getBlobProperties: vi.fn(),
  downloadBlob: vi.fn(),
  uploadBlob: vi.fn(async () => {}),
}));
vi.mock('../../../src/infrastructure/image/normalizeImage', () => ({ normalizeImage: vi.fn(), normalizeImageContain: vi.fn(), normalizeImageVariants: vi.fn() }));

import { deleteBlob, getBlobProperties, downloadBlob, uploadBlob } from '../../../src/infrastructure/storage/blobStorageHelpers';
import { normalizeImage, normalizeImageVariants } from '../../../src/infrastructure/image/normalizeImage';
import { verifyUploadedImageSize } from '../../../src/application/_shared/verifyUploadedImageSize';

const P = 'shops/s1/products/p1/img.jpg';
const SIZE = { width: 1200, height: 900 };
const MIN = { width: 800, height: 600 };
const run = (path = P) => verifyUploadedImageSize(path, SIZE, MIN, 'Dish photo', 'PRODUCT_IMAGE_WRONG_SIZE');
const WRONG_TYPE = { ok: false, code: 'INVALID_INPUT', error: 'Dish photo must be a JPEG, PNG or WebP image' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(downloadBlob).mockResolvedValue(Buffer.from('in'));
  vi.mocked(normalizeImage).mockResolvedValue({ status: 'ok', bytes: Buffer.from('out') });
});

describe('verifyUploadedImageSize', () => {
  it('missing upload', async () => {
    vi.mocked(getBlobProperties).mockResolvedValue(null);
    expect(await run()).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'Dish photo was not found - upload it first' });
    expect(normalizeImage).not.toHaveBeenCalled();
    expect(deleteBlob).not.toHaveBeenCalled();
  });

  it('too large is refused and deleted', async () => {
    vi.mocked(getBlobProperties).mockResolvedValue({ contentLength: 10485761, contentType: 'image/jpeg' });
    expect(await run()).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'Dish photo must be at most 10 MB' });
    expect(deleteBlob).toHaveBeenCalledWith(P);
    expect(normalizeImage).not.toHaveBeenCalled();
  });

  it('exactly 10 MB is fine', async () => {
    vi.mocked(getBlobProperties).mockResolvedValue({ contentLength: 10485760, contentType: 'image/jpeg' });
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

  it('undecodable bytes (e.g. svg) are refused and deleted', async () => {
    vi.mocked(getBlobProperties).mockResolvedValue({ contentLength: 1000, contentType: 'image/jpeg' });
    vi.mocked(normalizeImage).mockResolvedValue({ status: 'unsupported' });
    expect(await run()).toEqual(WRONG_TYPE);
    expect(deleteBlob).toHaveBeenCalledWith(P);
  });

  it('unknown extension is refused', async () => {
    vi.mocked(getBlobProperties).mockResolvedValue({ contentLength: 1000, contentType: 'image/gif' });
    expect(await run('shops/s1/products/p1/img.gif')).toEqual(WRONG_TYPE);
  });

  it('rewrites the blob with the normalised bytes and the extension content type', async () => {
    vi.mocked(getBlobProperties).mockResolvedValue({ contentLength: 1000, contentType: 'image/png' });
    expect(await run('shops/s1/products/p1/img.png')).toBeNull();
    expect(normalizeImage).toHaveBeenCalledWith(Buffer.from('in'), SIZE, MIN, 'png');
    expect(uploadBlob).toHaveBeenCalledWith('shops/s1/products/p1/img.png', Buffer.from('out'), 'image/png');
    expect(deleteBlob).not.toHaveBeenCalled();
  });

  it('too small a source is refused with the wrong-size code and deleted', async () => {
    vi.mocked(getBlobProperties).mockResolvedValue({ contentLength: 1000, contentType: 'image/jpeg' });
    vi.mocked(normalizeImage).mockResolvedValue({ status: 'too_small' });
    expect(await run()).toEqual({ ok: false, code: 'PRODUCT_IMAGE_WRONG_SIZE', error: 'Dish photo source must be at least 800 x 600 px' });
    expect(uploadBlob).not.toHaveBeenCalled();
    expect(deleteBlob).toHaveBeenCalledWith(P);
  });

  describe('variants', () => {
    const VARIANTS = [
      { suffix: 'card', size: { width: 800, height: 600 } },
      { suffix: 'thumb', size: { width: 400, height: 300 } },
    ];
    const runWith = () => verifyUploadedImageSize(P, SIZE, MIN, 'Dish photo', 'PRODUCT_IMAGE_WRONG_SIZE', 'cover', VARIANTS);
    beforeEach(() => {
      vi.mocked(getBlobProperties).mockResolvedValue({ contentLength: 1000, contentType: 'image/jpeg' });
      vi.mocked(normalizeImageVariants).mockResolvedValue([
        { suffix: 'card', bytes: Buffer.from('c') },
        { suffix: 'thumb', bytes: Buffer.from('t') },
      ]);
    });

    it('uploads the canonical blob and each variant to its suffixed path, from the original source', async () => {
      expect(await runWith()).toBeNull();
      expect(uploadBlob).toHaveBeenCalledWith(P, Buffer.from('out'), 'image/jpeg');
      expect(uploadBlob).toHaveBeenCalledWith('shops/s1/products/p1/img-card.jpg', Buffer.from('c'), 'image/jpeg');
      expect(uploadBlob).toHaveBeenCalledWith('shops/s1/products/p1/img-thumb.jpg', Buffer.from('t'), 'image/jpeg');
      expect(normalizeImageVariants).toHaveBeenCalledWith(
        Buffer.from('in'),
        [
          { ...VARIANTS[0], fit: 'cover' },
          { ...VARIANTS[1], fit: 'cover' },
        ],
        'jpg',
      );
    });

    it('a variant failure does not change the successful result', async () => {
      vi.mocked(normalizeImageVariants).mockRejectedValue(new Error('boom'));
      expect(await runWith()).toBeNull();
      vi.mocked(normalizeImageVariants).mockResolvedValue([{ suffix: 'card', bytes: Buffer.from('c') }]);
      vi.mocked(uploadBlob).mockImplementation(async (path: string) => {
        if (path.includes('-card')) throw new Error('upload failed');
      });
      expect(await runWith()).toBeNull();
      expect(deleteBlob).not.toHaveBeenCalled();
    });

    it('renders no variants when none are requested or the canonical image is refused', async () => {
      await run();
      expect(normalizeImageVariants).not.toHaveBeenCalled();
      vi.mocked(normalizeImage).mockResolvedValue({ status: 'too_small' });
      expect(await runWith()).not.toBeNull();
      expect(normalizeImageVariants).not.toHaveBeenCalled();
    });
  });
});
