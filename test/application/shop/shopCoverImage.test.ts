import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (actor: any) => ({ actorType: actor.actorType, actorId: actor.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
  updateShop: vi.fn(async (s: any) => s),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn(), diffFields: vi.fn(() => []) }));
vi.mock('../../../src/infrastructure/storage/blobStorageHelpers', () => ({
  validateContentType: (ct: string) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(ct.toLowerCase())) {
      throw new Error(`Content type ${ct} is not allowed. Allowed types: image/jpeg, image/png, image/webp`);
    }
  },
  getFileExtensionFromContentType: (ct: string) =>
    ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' } as Record<string, string>)[ct.toLowerCase()],
  generateShopBrandingBlobPath: (s: string, i: string, e: string) => `shops/${s}/branding/${i}${e}`,
  generateBlobUrl: (p: string) => `https://acct.blob.core.windows.net/product-media/${p}`,
  generateUploadSasUrl: (p: string) => ({
    sasUrl: `https://acct.blob.core.windows.net/product-media/${p}?sig=x`,
    expiresAt: '2026-10-06T00:10:00.000Z',
  }),
  deleteBlob: vi.fn(async () => {}),
  extractBlobPath: (u: string) => {
    const m = '/product-media/';
    const i = u.indexOf(m);
    return i === -1 ? null : u.slice(i + m.length);
  },
}));

import { executeGenerateShopCoverImageUploadUrl } from '../../../src/application/shop/generateShopCoverImageUploadUrl/executeGenerateShopCoverImageUploadUrl';
import { executeSetShopCoverImage } from '../../../src/application/shop/setShopCoverImage/executeSetShopCoverImage';
import { executeRemoveShopCoverImage } from '../../../src/application/shop/removeShopCoverImage/executeRemoveShopCoverImage';
import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { findShopById, updateShop } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { deleteBlob } from '../../../src/infrastructure/storage/blobStorageHelpers';

const BASE = 'https://acct.blob.core.windows.net/product-media/';
const httpRequest = {} as any;
const ownerAccess = { ok: true, actor: { actorType: 'owner', actorId: 'u1', role: 'owner' }, permissions: ['manage_shop'] };
const forbidden = { ok: false, code: 'FORBIDDEN', error: 'Not allowed' };

const makeShop = (o: Record<string, unknown> = {}): any => ({
  id: 'shop-1',
  name: 'Pizzeria',
  slug: 'p',
  isDeleted: false,
  branding: { logoUrl: BASE + 'shops/shop-1/branding/logo.png', heroImageUrl: null, accentColor: '#E63946' },
  createdAt: 'x',
  updatedAt: 'x',
  ...o,
});
const withHero = (url: string) =>
  makeShop({ branding: { logoUrl: BASE + 'shops/shop-1/branding/logo.png', heroImageUrl: url, accentColor: '#E63946' } });

const newUrl = BASE + 'shops/shop-1/branding/img-1.jpg';
const setReq = { shopId: 'shop-1', imageId: 'img-1', url: newUrl };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authorizeShopAction).mockResolvedValue(ownerAccess as any);
  vi.mocked(findShopById).mockResolvedValue(makeShop());
  vi.mocked(updateShop).mockImplementation(async (s: any) => s);
  vi.mocked(deleteBlob).mockResolvedValue(undefined as any);
});

describe('shop cover image', () => {
  it('cover upload URL: refuses a GIF', async () => {
    const r = await executeGenerateShopCoverImageUploadUrl({ shopId: 'shop-1', contentType: 'image/gif' }, httpRequest);
    expect(r).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'Content type image/gif is not allowed. Allowed types: image/jpeg, image/png, image/webp',
    });
  });

  it('cover upload URL: returns a blob URL in the shop branding folder', async () => {
    const r = await executeGenerateShopCoverImageUploadUrl({ shopId: 'shop-1', contentType: 'image/webp' }, httpRequest);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.blobUrl).toBe(BASE + 'shops/shop-1/branding/' + r.data.imageId + '.webp');
    expect(r.data.uploadUrl.startsWith(r.data.blobUrl + '?')).toBe(true);
  });

  it('set cover: saves the URL, keeps logo and accent, logs shop.cover_image', async () => {
    const r = await executeSetShopCoverImage(setReq, httpRequest);
    expect(r.ok).toBe(true);
    expect(updateShop).toHaveBeenCalledWith(
      expect.objectContaining({
        branding: { logoUrl: BASE + 'shops/shop-1/branding/logo.png', heroImageUrl: newUrl, accentColor: '#E63946' },
      }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: 'shop-1', action: 'shop.cover_image', entityType: 'shop', entityId: 'shop-1', entityName: 'Pizzeria' }),
    );
    expect(deleteBlob).not.toHaveBeenCalled();
    if (r.ok) expect(r.data.branding?.heroImageUrl).toBe(newUrl);
  });

  it('set cover: creates branding when the shop has none', async () => {
    vi.mocked(findShopById).mockResolvedValue(makeShop({ branding: null }));
    const r = await executeSetShopCoverImage(setReq, httpRequest);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.branding).toEqual({ logoUrl: null, heroImageUrl: newUrl, accentColor: null });
  });

  it('set cover: deletes the previous cover file after saving', async () => {
    vi.mocked(findShopById).mockResolvedValue(withHero(BASE + 'shops/shop-1/branding/old.jpg'));
    await executeSetShopCoverImage(setReq, httpRequest);
    expect(deleteBlob).toHaveBeenCalledTimes(1);
    expect(deleteBlob).toHaveBeenCalledWith('shops/shop-1/branding/old.jpg');
    expect(vi.mocked(updateShop).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(deleteBlob).mock.invocationCallOrder[0]);
  });

  it("set cover: refuses a URL outside this shop's branding folder", async () => {
    for (const url of [
      BASE + 'shops/shop-2/branding/img-1.jpg',
      BASE + 'shops/shop-1/branding/other.jpg',
      'https://evil.example/img-1.jpg',
      'https://evil.example/product-media/shops/shop-1/branding/img-1.jpg',
      BASE + 'shops/shop-1/branding/img-1./../../shop-2/x.jpg',
      BASE + 'shops/shop-1/branding/img-1.jpg/extra.jpg',
      BASE + 'shops/shop-1/branding/img-1.jpg?x=1',
      BASE + 'shops/shop-1/branding/img-1.jpg#frag',
      BASE + 'shops/shop-1/branding/img-1.gif',
    ]) {
      const r = await executeSetShopCoverImage({ shopId: 'shop-1', imageId: 'img-1', url }, httpRequest);
      expect(r).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'url must be the cover image uploaded for this shop' });
    }
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('set cover: refuses an imageId that carries path segments', async () => {
    const imageId = 'x/../../shop-2/y';
    const r = await executeSetShopCoverImage(
      { shopId: 'shop-1', imageId, url: BASE + `shops/shop-1/branding/${imageId}.jpg` },
      httpRequest,
    );
    expect(r).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'url must be the cover image uploaded for this shop' });
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('set cover: refuses a caller without manage_shop', async () => {
    vi.mocked(authorizeShopAction).mockResolvedValue(forbidden as any);
    const r = await executeSetShopCoverImage(setReq, httpRequest);
    expect(r).toEqual(forbidden);
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('set cover: still succeeds when deleting the old file fails', async () => {
    vi.mocked(findShopById).mockResolvedValue(withHero(BASE + 'shops/shop-1/branding/old.jpg'));
    vi.mocked(deleteBlob).mockRejectedValueOnce(new Error('boom'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await executeSetShopCoverImage(setReq, httpRequest);
    spy.mockRestore();
    expect(r.ok).toBe(true);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.cover_image' }));
  });

  it('remove cover: clears it, deletes the file, logs shop.cover_image_remove', async () => {
    vi.mocked(findShopById).mockResolvedValue(withHero(BASE + 'shops/shop-1/branding/old.jpg'));
    const r = await executeRemoveShopCoverImage({ shopId: 'shop-1' }, httpRequest);
    expect(r.ok).toBe(true);
    expect(updateShop).toHaveBeenCalledWith(
      expect.objectContaining({
        branding: { logoUrl: BASE + 'shops/shop-1/branding/logo.png', heroImageUrl: null, accentColor: '#E63946' },
      }),
    );
    expect(deleteBlob).toHaveBeenCalledWith('shops/shop-1/branding/old.jpg');
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.cover_image_remove' }));
  });

  it('remove cover: no cover set is a no-op success', async () => {
    const r = await executeRemoveShopCoverImage({ shopId: 'shop-1' }, httpRequest);
    expect(r.ok).toBe(true);
    expect(updateShop).not.toHaveBeenCalled();
    expect(deleteBlob).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('remove cover: refuses a caller without manage_shop', async () => {
    vi.mocked(authorizeShopAction).mockResolvedValue(forbidden as any);
    const r = await executeRemoveShopCoverImage({ shopId: 'shop-1' }, httpRequest);
    expect(r).toEqual(forbidden);
    expect(updateShop).not.toHaveBeenCalled();
  });
});
