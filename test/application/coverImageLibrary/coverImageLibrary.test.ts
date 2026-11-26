import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (actor: any) => ({ actorType: actor.actorType, actorId: actor.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
  updateShop: vi.fn(async (s: any) => s),
}));
vi.mock('../../../src/infrastructure/cosmos/system/CosmosCoverImageLibraryRepository', () => ({
  getCoverImageLibrary: vi.fn(),
  saveCoverImageLibrary: vi.fn(async () => {}),
  getSortedCoverImageLibrary: vi.fn(),
}));
vi.mock('../../../src/infrastructure/auth/superAdminAuthHelpers', () => ({
  verifySuperAdminToken: vi.fn(),
  requirePlatform: vi.fn(),
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
  generateCoverLibraryBlobPath: (i: string, e: string) => `platform/cover-library/${i}${e}`,
  generateBlobUrl: (p: string) => `https://acct.blob.core.windows.net/product-media/${p}`,
  generateUploadSasUrl: (p: string) => ({
    sasUrl: `https://acct.blob.core.windows.net/product-media/${p}?sig=x`,
    expiresAt: '2026-10-06T00:10:00.000Z',
  }),
  deleteBlob: vi.fn(async () => {}),
  getBlobProperties: vi.fn(),
  downloadBlob: vi.fn(async () => Buffer.from('x')),
  uploadBlob: vi.fn(async () => {}),
  copyBlob: vi.fn(async () => {}),
}));
vi.mock('../../../src/infrastructure/image/normalizeImage', () => ({
  normalizeImage: vi.fn(),
  normalizeImageContain: vi.fn(),
  normalizeImageVariants: vi.fn(async () => []),
}));

import { normalizeImage } from '../../../src/infrastructure/image/normalizeImage';
import { executeGenerateCoverLibraryUploadUrl } from '../../../src/application/coverImageLibrary/generateCoverLibraryUploadUrl/executeGenerateCoverLibraryUploadUrl';
import { executeRegisterCoverLibraryImage } from '../../../src/application/coverImageLibrary/registerCoverLibraryImage/executeRegisterCoverLibraryImage';
import { executeRenameCoverLibraryImage } from '../../../src/application/coverImageLibrary/renameCoverLibraryImage/executeRenameCoverLibraryImage';
import { executeDeleteCoverLibraryImage } from '../../../src/application/coverImageLibrary/deleteCoverLibraryImage/executeDeleteCoverLibraryImage';
import { executeListCoverImageLibraryForPlatform } from '../../../src/application/coverImageLibrary/listCoverImageLibraryForPlatform/executeListCoverImageLibraryForPlatform';
import { executeListCoverImageLibraryForShop } from '../../../src/application/coverImageLibrary/listCoverImageLibraryForShop/executeListCoverImageLibraryForShop';
import { executeUseLibraryCoverImageForShop } from '../../../src/application/coverImageLibrary/useLibraryCoverImageForShop/executeUseLibraryCoverImageForShop';
import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { findShopById, updateShop } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import {
  getCoverImageLibrary,
  saveCoverImageLibrary,
  getSortedCoverImageLibrary,
} from '../../../src/infrastructure/cosmos/system/CosmosCoverImageLibraryRepository';
import { verifySuperAdminToken, requirePlatform } from '../../../src/infrastructure/auth/superAdminAuthHelpers';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { deleteBlob, getBlobProperties, copyBlob } from '../../../src/infrastructure/storage/blobStorageHelpers';

const BASE = 'https://acct.blob.core.windows.net/product-media/';
const httpRequest = {} as any;
const ownerAccess = { ok: true, actor: { actorType: 'owner', actorId: 'u1', role: 'owner' }, permissions: ['manage_shop'] };
const forbidden = { ok: false, code: 'FORBIDDEN', error: 'Not allowed' };

const entry = (id: string, order: number, ext = '.jpg'): any => ({
  id,
  name: `Name ${id}`,
  imageUrl: `${BASE}platform/cover-library/${id}${ext}`,
  cardImageUrl: `${BASE}platform/cover-library/${id}-card${ext}`,
  createdAt: '2026-11-26T00:00:00.000Z',
  order,
});
const makeShop = (heroImageUrl: string | null = null): any => ({
  id: 'shop-1',
  name: 'Pizzeria',
  slug: 'p',
  isDeleted: false,
  branding: { logoUrl: BASE + 'shops/shop-1/branding/logo.png', heroImageUrl, accentColor: '#E63946' },
  createdAt: 'x',
  updatedAt: 'x',
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STORAGE_ACCOUNT_NAME', 'acct');
  vi.mocked(verifySuperAdminToken).mockResolvedValue('admin-1');
  vi.mocked(requirePlatform).mockResolvedValue('admin-1');
  vi.mocked(getCoverImageLibrary).mockResolvedValue([]);
  vi.mocked(getSortedCoverImageLibrary).mockResolvedValue([]);
  vi.mocked(getBlobProperties).mockResolvedValue({ contentLength: 200_000, contentType: 'image/jpeg' });
  vi.mocked(normalizeImage).mockResolvedValue({ status: 'ok', bytes: Buffer.from('norm') });
  vi.mocked(authorizeShopAction).mockResolvedValue(ownerAccess as any);
  vi.mocked(findShopById).mockResolvedValue(makeShop());
  vi.mocked(updateShop).mockImplementation(async (s: any) => s);
});
afterEach(() => vi.unstubAllEnvs());

describe('cover library: upload url', () => {
  it('is forbidden for a non-superadmin', async () => {
    vi.mocked(verifySuperAdminToken).mockResolvedValue(null);
    const r = await executeGenerateCoverLibraryUploadUrl({ contentType: 'image/jpeg' }, httpRequest);
    expect(r).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
  it('maps a thrown auth error to FORBIDDEN', async () => {
    vi.mocked(verifySuperAdminToken).mockRejectedValue(new Error('Authentication required'));
    const r = await executeGenerateCoverLibraryUploadUrl({ contentType: 'image/jpeg' }, httpRequest);
    expect(r).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
  it('rejects a GIF', async () => {
    const r = await executeGenerateCoverLibraryUploadUrl({ contentType: 'image/gif' }, httpRequest);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });
  it('returns a platform/cover-library blob url', async () => {
    const r = await executeGenerateCoverLibraryUploadUrl({ contentType: 'image/png' }, httpRequest);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.blobUrl).toBe(`${BASE}platform/cover-library/${r.data.imageId}.png`);
      expect(r.data.uploadUrl).toContain('platform/cover-library/');
    }
  });
});

describe('cover library: register', () => {
  const req = { imageId: 'img-1', url: `${BASE}platform/cover-library/img-1.jpg`, name: '  Sunset  ' };
  it('is forbidden for a non-superadmin', async () => {
    vi.mocked(verifySuperAdminToken).mockResolvedValue(null);
    expect(await executeRegisterCoverLibraryImage(req, httpRequest)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
  it('rejects a bad name', async () => {
    const r = await executeRegisterCoverLibraryImage({ ...req, name: 'x'.repeat(101) }, httpRequest);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });
  it('rejects a URL outside the cover-library folder', async () => {
    const r = await executeRegisterCoverLibraryImage({ ...req, url: `${BASE}shops/shop-1/branding/img-1.jpg` }, httpRequest);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(saveCoverImageLibrary).not.toHaveBeenCalled();
  });
  it('rejects a wrong pixel size', async () => {
    vi.mocked(normalizeImage).mockResolvedValue({ status: 'too_small' } as any);
    const r = await executeRegisterCoverLibraryImage(req, httpRequest);
    expect(r).toMatchObject({ ok: false, code: 'COVER_IMAGE_WRONG_SIZE' });
    expect(saveCoverImageLibrary).not.toHaveBeenCalled();
  });
  it('rejects once the library holds 50 entries', async () => {
    vi.mocked(getCoverImageLibrary).mockResolvedValue(Array.from({ length: 50 }, (_, i) => entry(`e${i}`, i)));
    const r = await executeRegisterCoverLibraryImage(req, httpRequest);
    expect(r).toMatchObject({ ok: false, code: 'LIMIT_REACHED', error: 'Cover image library is full (max 50 images)' });
    expect(saveCoverImageLibrary).not.toHaveBeenCalled();
  });
  it('registers, assigns the next order and audits', async () => {
    vi.mocked(getCoverImageLibrary).mockResolvedValue([entry('a', 0), entry('b', 1)]);
    const r = await executeRegisterCoverLibraryImage(req, httpRequest);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toMatchObject({
        id: 'img-1',
        name: 'Sunset',
        imageUrl: req.url,
        cardImageUrl: `${BASE}platform/cover-library/img-1-card.jpg`,
        order: 2,
      });
    }
    expect(saveCoverImageLibrary).toHaveBeenCalledWith([expect.anything(), expect.anything(), expect.objectContaining({ id: 'img-1', order: 2 })]);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: 'platform', actorType: 'superadmin', actorId: 'admin-1', action: 'platform.cover_image.register', entityType: 'coverImageLibrary', entityId: 'img-1' }),
    );
  });
});

describe('cover library: rename', () => {
  beforeEach(() => vi.mocked(getCoverImageLibrary).mockResolvedValue([entry('a', 0)]));
  it('is forbidden for a non-superadmin', async () => {
    vi.mocked(verifySuperAdminToken).mockResolvedValue(null);
    expect(await executeRenameCoverLibraryImage({ imageId: 'a', name: 'N' }, httpRequest)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
  it('404s for an unknown id', async () => {
    expect(await executeRenameCoverLibraryImage({ imageId: 'zzz', name: 'N' }, httpRequest)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
  it('updates the name and audits the change', async () => {
    const r = await executeRenameCoverLibraryImage({ imageId: 'a', name: 'New' }, httpRequest);
    expect(r.ok && r.data.name).toBe('New');
    expect(saveCoverImageLibrary).toHaveBeenCalledWith([expect.objectContaining({ id: 'a', name: 'New' })]);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'platform.cover_image.rename', entityId: 'a', entityName: 'New', changes: [{ field: 'name', from: 'Name a', to: 'New' }] }),
    );
  });
  it('writes no audit entry when the name is unchanged', async () => {
    const r = await executeRenameCoverLibraryImage({ imageId: 'a', name: 'Name a' }, httpRequest);
    expect(r.ok).toBe(true);
    expect(logAudit).not.toHaveBeenCalled();
    expect(saveCoverImageLibrary).not.toHaveBeenCalled();
  });
});

describe('cover library: delete', () => {
  beforeEach(() => vi.mocked(getCoverImageLibrary).mockResolvedValue([entry('a', 0), entry('b', 1)]));
  it('is forbidden for a non-superadmin', async () => {
    vi.mocked(verifySuperAdminToken).mockResolvedValue(null);
    expect(await executeDeleteCoverLibraryImage({ imageId: 'a' }, httpRequest)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
  it('404s for an unknown id', async () => {
    expect(await executeDeleteCoverLibraryImage({ imageId: 'zzz' }, httpRequest)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
  it('removes the entry and its blobs, audits, and never reads a shop', async () => {
    const r = await executeDeleteCoverLibraryImage({ imageId: 'a' }, httpRequest);
    expect(r).toEqual({ ok: true, data: { id: 'a', deleted: true } });
    expect(saveCoverImageLibrary).toHaveBeenCalledWith([expect.objectContaining({ id: 'b' })]);
    const deleted = vi.mocked(deleteBlob).mock.calls.map((c) => c[0]);
    expect(deleted).toEqual(['platform/cover-library/a.jpg', 'platform/cover-library/a-card.jpg']);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: 'platform', action: 'platform.cover_image.delete', entityType: 'coverImageLibrary', entityId: 'a' }),
    );
    expect(findShopById).not.toHaveBeenCalled();
    expect(updateShop).not.toHaveBeenCalled();
    expect(authorizeShopAction).not.toHaveBeenCalled();
  });
});

describe('cover library: list (platform)', () => {
  it('returns the sorted library at read level', async () => {
    vi.mocked(getSortedCoverImageLibrary).mockResolvedValue([entry('a', 0)]);
    const r = await executeListCoverImageLibraryForPlatform(httpRequest);
    expect(requirePlatform).toHaveBeenCalledWith(httpRequest, 'read');
    expect(r).toMatchObject({ ok: true, data: { images: [expect.objectContaining({ id: 'a' })] } });
  });
  it('is forbidden for anyone else', async () => {
    vi.mocked(requirePlatform).mockResolvedValue(null);
    expect(await executeListCoverImageLibraryForPlatform(httpRequest)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});

describe('cover library: list (shop)', () => {
  it('lets a manage_shop user read it', async () => {
    vi.mocked(getSortedCoverImageLibrary).mockResolvedValue([entry('a', 0)]);
    const r = await executeListCoverImageLibraryForShop({ shopId: 'shop-1' }, httpRequest);
    expect(authorizeShopAction).toHaveBeenCalledWith(httpRequest, expect.anything(), 'manage_shop');
    expect(r).toMatchObject({ ok: true, data: { images: [expect.objectContaining({ id: 'a' })] } });
  });
  it('is forbidden without manage_shop', async () => {
    vi.mocked(authorizeShopAction).mockResolvedValue(forbidden as any);
    expect(await executeListCoverImageLibraryForShop({ shopId: 'shop-1' }, httpRequest)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
  it('404s for an unknown shop', async () => {
    vi.mocked(findShopById).mockResolvedValue(null as any);
    expect(await executeListCoverImageLibraryForShop({ shopId: 'nope' }, httpRequest)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('cover library: use for shop', () => {
  const req = { shopId: 'shop-1', libraryImageId: 'lib-1' };
  beforeEach(() => vi.mocked(getCoverImageLibrary).mockResolvedValue([entry('lib-1', 0)]));

  it('copies canonical + card into the shop branding folder and sets the cover', async () => {
    vi.mocked(findShopById).mockResolvedValue(makeShop(BASE + 'shops/shop-1/branding/old.jpg'));
    const r = await executeUseLibraryCoverImageForShop(req, httpRequest);
    expect(r.ok).toBe(true);
    const calls = vi.mocked(copyBlob).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe('platform/cover-library/lib-1.jpg');
    expect(calls[0][1]).toMatch(/^shops\/shop-1\/branding\/[A-Za-z0-9-]+\.jpg$/);
    expect(calls[0][2]).toBe('image/jpeg');
    expect(calls[1][0]).toBe('platform/cover-library/lib-1-card.jpg');
    expect(calls[1][1]).toMatch(/^shops\/shop-1\/branding\/[A-Za-z0-9-]+-card\.jpg$/);
    const saved = vi.mocked(updateShop).mock.calls[0][0] as any;
    expect(saved.branding.heroImageUrl).toBe(BASE + calls[0][1]);
    expect(saved.branding.heroImageUrl).not.toContain('platform/');
    expect(vi.mocked(deleteBlob).mock.calls.map((c) => c[0])).toEqual([
      'shops/shop-1/branding/old.jpg',
      'shops/shop-1/branding/old-card.jpg',
    ]);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ shopId: 'shop-1', action: 'shop.cover_image', entityType: 'shop', entityId: 'shop-1' }));
  });
  it('404s for an unknown libraryImageId', async () => {
    expect(await executeUseLibraryCoverImageForShop({ ...req, libraryImageId: 'zzz' }, httpRequest)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(copyBlob).not.toHaveBeenCalled();
  });
  it('is forbidden without manage_shop', async () => {
    vi.mocked(authorizeShopAction).mockResolvedValue(forbidden as any);
    expect(await executeUseLibraryCoverImageForShop(req, httpRequest)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(copyBlob).not.toHaveBeenCalled();
  });
  it('fails without touching branding if the canonical copy throws', async () => {
    vi.mocked(copyBlob).mockRejectedValueOnce(new Error('boom'));
    const r = await executeUseLibraryCoverImageForShop(req, httpRequest);
    expect(r).toMatchObject({ ok: false, code: 'INTERNAL_ERROR' });
    expect(updateShop).not.toHaveBeenCalled();
  });
  it('tolerates a failed card copy', async () => {
    vi.mocked(copyBlob).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('card'));
    const r = await executeUseLibraryCoverImageForShop(req, httpRequest);
    expect(r.ok).toBe(true);
    expect(updateShop).toHaveBeenCalled();
  });
  it('deleting the library entry afterwards only touches the platform folder', async () => {
    await executeUseLibraryCoverImageForShop(req, httpRequest);
    vi.clearAllMocks();
    vi.mocked(verifySuperAdminToken).mockResolvedValue('admin-1');
    vi.mocked(getCoverImageLibrary).mockResolvedValue([entry('lib-1', 0)]);
    await executeDeleteCoverLibraryImage({ imageId: 'lib-1' }, httpRequest);
    const paths = vi.mocked(deleteBlob).mock.calls.map((c) => c[0]);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((p) => p.startsWith('platform/cover-library/'))).toBe(true);
    expect(findShopById).not.toHaveBeenCalled();
    expect(updateShop).not.toHaveBeenCalled();
  });
});
