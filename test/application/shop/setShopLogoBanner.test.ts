import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (a: any) => ({ actorType: a.actorType, actorId: a.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
  updateShop: vi.fn(async (s: any) => s),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn(), diffFields: vi.fn(() => []) }));
vi.mock('../../../src/infrastructure/storage/blobStorageHelpers', () => ({
  generateBlobUrl: (p: string) => `https://acct.blob.core.windows.net/product-media/${p}`,
  deleteBlob: vi.fn(async () => {}),
  getBlobProperties: vi.fn(),
  downloadBlob: vi.fn(async () => Buffer.from('x')),
  uploadBlob: vi.fn(async () => {}),
}));
vi.mock('../../../src/infrastructure/image/normalizeImage', () => ({
  normalizeImage: vi.fn(),
  normalizeImageContain: vi.fn(),
}));

import { executeSetShopLogo } from '../../../src/application/shop/setShopLogo/executeSetShopLogo';
import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { findShopById, updateShop } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { deleteBlob, getBlobProperties, uploadBlob, downloadBlob } from '../../../src/infrastructure/storage/blobStorageHelpers';
import { normalizeImage, normalizeImageContain } from '../../../src/infrastructure/image/normalizeImage';

const BASE = 'https://acct.blob.core.windows.net/product-media/';
const httpRequest = {} as any;
const URL_ERROR = { ok: false, code: 'INVALID_INPUT', error: 'url must be the logo uploaded for this shop' };

const makeShop = (branding: Record<string, unknown> | null): any => ({
  id: 'shop-1', name: 'P', slug: 'p', isDeleted: false, createdAt: 'x', updatedAt: 'x', branding,
});

const newUrl = BASE + 'shops/shop-1/branding/img-1.png';
const setReq = { shopId: 'shop-1', imageId: 'img-1', url: newUrl };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STORAGE_ACCOUNT_NAME', 'acct');
  vi.mocked(authorizeShopAction).mockResolvedValue({
    ok: true, actor: { actorType: 'owner', actorId: 'u1' }, permissions: ['manage_shop'],
  } as any);
  vi.mocked(findShopById).mockResolvedValue(
    makeShop({ logoUrl: null, heroImageUrl: 'https://x/h.jpg', accentColor: null, showHero: false }),
  );
  vi.mocked(updateShop).mockImplementation(async (s: any) => s);
  vi.mocked(deleteBlob).mockResolvedValue(undefined as any);
  vi.mocked(getBlobProperties).mockResolvedValue({ contentLength: 50_000, contentType: 'image/png' });
  vi.mocked(normalizeImageContain).mockResolvedValue({ status: 'ok', bytes: Buffer.from('norm') });
});

afterEach(() => vi.unstubAllEnvs());

describe('logo upload and the banner switch', () => {
  it('keeps showHero=false and the cover picture when the logo changes', async () => {
    const r = await executeSetShopLogo(setReq, httpRequest);
    expect(r.ok).toBe(true);
    expect(updateShop).toHaveBeenCalledWith(
      expect.objectContaining({ branding: expect.objectContaining({ logoUrl: newUrl, heroImageUrl: 'https://x/h.jpg', showHero: false }) }),
    );
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.logo', entityId: 'shop-1' }));
  });
});

describe('logo upload is capped, type-checked and normalised', () => {
  it("refuses a URL that is not this shop's issued logo blob", async () => {
    for (const url of [
      BASE + 'shops/shop-2/branding/img-1.png',
      BASE + 'shops/shop-1/branding/other.png',
      BASE + 'shops/shop-1/logo/img-1.png',
      BASE + 'shops/shop-1/products/img-1.png',
      'https://x/logo.png',
      'https://evil.example/product-media/shops/shop-1/branding/img-1.png',
      BASE + 'shops/shop-1/branding/img-1./../../shop-2/x.png',
      BASE + 'shops/shop-1/branding/img-1.png/extra.png',
      BASE + 'shops/shop-1/branding/img-1.png?x=1',
      BASE + 'shops/shop-1/branding/img-1.png#frag',
      BASE + 'shops/shop-1/branding/img-1.gif',
      BASE + 'shops/shop-1/branding/img-1.svg',
    ]) {
      const r = await executeSetShopLogo({ shopId: 'shop-1', imageId: 'img-1', url }, httpRequest);
      expect(r).toEqual(URL_ERROR);
    }
    expect(getBlobProperties).not.toHaveBeenCalled();
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('refuses an imageId that carries path segments', async () => {
    const imageId = 'x/../../shop-2/y';
    const r = await executeSetShopLogo({ shopId: 'shop-1', imageId, url: BASE + `shops/shop-1/branding/${imageId}.png` }, httpRequest);
    expect(r).toEqual(URL_ERROR);
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('refuses a file over 10 MB, deletes it, leaves the shop unchanged', async () => {
    vi.mocked(getBlobProperties).mockResolvedValue({ contentLength: 10 * 1024 * 1024 + 1, contentType: 'image/png' });
    const r = await executeSetShopLogo(setReq, httpRequest);
    expect(r).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'Logo must be at most 10 MB' });
    expect(deleteBlob).toHaveBeenCalledWith('shops/shop-1/branding/img-1.png');
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(updateShop).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('accepts exactly 10 MB', async () => {
    vi.mocked(getBlobProperties).mockResolvedValue({ contentLength: 10 * 1024 * 1024, contentType: 'image/png' });
    expect((await executeSetShopLogo(setReq, httpRequest)).ok).toBe(true);
  });

  it('refuses a declared type that does not match the extension', async () => {
    vi.mocked(getBlobProperties).mockResolvedValue({ contentLength: 50_000, contentType: 'image/svg+xml' });
    const r = await executeSetShopLogo(setReq, httpRequest);
    expect(r).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'Logo must be a JPEG, PNG or WebP image' });
    expect(deleteBlob).toHaveBeenCalledWith('shops/shop-1/branding/img-1.png');
    expect(normalizeImageContain).not.toHaveBeenCalled();
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('answers INVALID_INPUT when nothing was uploaded', async () => {
    vi.mocked(getBlobProperties).mockResolvedValue(null as any);
    const r = await executeSetShopLogo(setReq, httpRequest);
    expect(r).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'Logo was not found - upload it first' });
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('normalises to fit 640 x 96 in the declared format and stores the result at the blob path', async () => {
    for (const [ext, contentType, fmt] of [
      ['.png', 'image/png', 'png'],
      ['.jpg', 'image/jpeg', 'jpg'],
      ['.webp', 'image/webp', 'webp'],
    ] as const) {
      vi.clearAllMocks();
      vi.mocked(getBlobProperties).mockResolvedValue({ contentLength: 50_000, contentType });
      const url = BASE + `shops/shop-1/branding/img-1${ext}`;
      const r = await executeSetShopLogo({ shopId: 'shop-1', imageId: 'img-1', url }, httpRequest);
      expect(r.ok).toBe(true);
      expect(normalizeImageContain).toHaveBeenCalledWith(expect.anything(), { width: 640, height: 96 }, fmt);
      expect(normalizeImage).not.toHaveBeenCalled();
      expect(uploadBlob).toHaveBeenCalledWith(`shops/shop-1/branding/img-1${ext}`, Buffer.from('norm'), contentType);
      expect(vi.mocked(uploadBlob).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(updateShop).mock.invocationCallOrder[0]);
    }
  });

  it('refuses a file that cannot be decoded as an image', async () => {
    vi.mocked(normalizeImageContain).mockResolvedValue({ status: 'unsupported' });
    const r = await executeSetShopLogo(setReq, httpRequest);
    expect(r).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'Logo must be a JPEG, PNG or WebP image' });
    expect(deleteBlob).toHaveBeenCalledTimes(1);
    expect(deleteBlob).toHaveBeenCalledWith('shops/shop-1/branding/img-1.png');
    expect(uploadBlob).not.toHaveBeenCalled();
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('still deletes the previous own logo on a successful set, never a foreign one', async () => {
    vi.mocked(findShopById).mockResolvedValue(
      makeShop({ logoUrl: BASE + 'shops/shop-1/branding/old.png', heroImageUrl: null, accentColor: null }),
    );
    const r = await executeSetShopLogo(setReq, httpRequest);
    expect(r.ok).toBe(true);
    expect(deleteBlob).toHaveBeenCalledTimes(2); // canonical + thumb variant
    expect(deleteBlob).toHaveBeenCalledWith('shops/shop-1/branding/old.png');
    expect(deleteBlob).toHaveBeenCalledWith('shops/shop-1/branding/old-thumb.png');
    expect(updateShop).toHaveBeenCalledTimes(1);

    vi.mocked(deleteBlob).mockClear();
    vi.mocked(findShopById).mockResolvedValue(
      makeShop({ logoUrl: BASE + 'shops/shop-2/branding/old.png', heroImageUrl: null, accentColor: null }),
    );
    expect((await executeSetShopLogo(setReq, httpRequest)).ok).toBe(true);
    expect(deleteBlob).not.toHaveBeenCalled();
  });

  it('does not delete the previous logo when the upload is refused', async () => {
    vi.mocked(findShopById).mockResolvedValue(
      makeShop({ logoUrl: BASE + 'shops/shop-1/branding/old.png', heroImageUrl: null, accentColor: null }),
    );
    vi.mocked(normalizeImageContain).mockResolvedValue({ status: 'unsupported' });
    await executeSetShopLogo(setReq, httpRequest);
    expect(deleteBlob).not.toHaveBeenCalledWith('shops/shop-1/branding/old.png');
  });
});
