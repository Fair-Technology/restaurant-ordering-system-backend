import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  deleteBlob: vi.fn(async () => {}),
}));

import { executeRemoveShopLogo } from '../../../src/application/shop/removeShopLogo/executeRemoveShopLogo';
import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { findShopById, updateShop } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { deleteBlob } from '../../../src/infrastructure/storage/blobStorageHelpers';

const BASE = 'https://acct.blob.core.windows.net/product-media/';
const httpRequest = {} as any;
const ownerAccess = { ok: true, actor: { actorType: 'owner', actorId: 'u1', role: 'owner' }, permissions: ['manage_shop'] };
const forbidden = { ok: false, code: 'FORBIDDEN', error: 'Not allowed' };
const logoUrl = BASE + 'shops/shop-1/branding/logo.png';
const heroUrl = BASE + 'shops/shop-1/branding/hero.jpg';

const makeShop = (branding: Record<string, unknown> | null = { logoUrl, heroImageUrl: heroUrl, accentColor: '#E63946' }): any => ({
  id: 'shop-1',
  name: 'Pizzeria',
  slug: 'p',
  isDeleted: false,
  branding,
  createdAt: 'x',
  updatedAt: 'x',
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STORAGE_ACCOUNT_NAME', 'acct');
  vi.mocked(authorizeShopAction).mockResolvedValue(ownerAccess as any);
  vi.mocked(findShopById).mockResolvedValue(makeShop());
  vi.mocked(updateShop).mockImplementation(async (s: any) => s);
  vi.mocked(deleteBlob).mockResolvedValue(undefined as any);
});

afterEach(() => vi.unstubAllEnvs());

describe('remove shop logo', () => {
  it('clears it, keeps hero and accent, deletes the file, logs shop.logo_remove', async () => {
    const r = await executeRemoveShopLogo({ shopId: 'shop-1' }, httpRequest);
    expect(r.ok).toBe(true);
    expect(updateShop).toHaveBeenCalledWith(
      expect.objectContaining({ branding: { logoUrl: null, heroImageUrl: heroUrl, accentColor: '#E63946' } }),
    );
    expect(deleteBlob).toHaveBeenCalledWith('shops/shop-1/branding/logo.png');
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: 'shop-1', action: 'shop.logo_remove', entityType: 'shop', entityId: 'shop-1', entityName: 'Pizzeria' }),
    );
    if (r.ok) expect(r.data.branding?.logoUrl).toBeNull();
  });

  it('keeps other branding fields such as showHero', async () => {
    vi.mocked(findShopById).mockResolvedValue(makeShop({ logoUrl, heroImageUrl: heroUrl, accentColor: null, showHero: false }));
    await executeRemoveShopLogo({ shopId: 'shop-1' }, httpRequest);
    expect(updateShop).toHaveBeenCalledWith(
      expect.objectContaining({ branding: expect.objectContaining({ logoUrl: null, showHero: false }) }),
    );
  });

  it('no logo set is a no-op success', async () => {
    vi.mocked(findShopById).mockResolvedValue(makeShop({ logoUrl: null, heroImageUrl: heroUrl, accentColor: null }));
    const r = await executeRemoveShopLogo({ shopId: 'shop-1' }, httpRequest);
    expect(r.ok).toBe(true);
    expect(updateShop).not.toHaveBeenCalled();
    expect(deleteBlob).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('no branding at all is a no-op success', async () => {
    vi.mocked(findShopById).mockResolvedValue(makeShop(null));
    const r = await executeRemoveShopLogo({ shopId: 'shop-1' }, httpRequest);
    expect(r.ok).toBe(true);
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('refuses a caller without manage_shop', async () => {
    vi.mocked(authorizeShopAction).mockResolvedValue(forbidden as any);
    const r = await executeRemoveShopLogo({ shopId: 'shop-1' }, httpRequest);
    expect(r).toEqual(forbidden);
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('answers NOT_FOUND for a missing shop and INVALID_INPUT for a blank id', async () => {
    vi.mocked(findShopById).mockResolvedValue(null as any);
    expect(await executeRemoveShopLogo({ shopId: 'shop-1' }, httpRequest)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await executeRemoveShopLogo({ shopId: ' ' }, httpRequest)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('never deletes another shop file', async () => {
    vi.mocked(findShopById).mockResolvedValue(
      makeShop({ logoUrl: BASE + 'shops/shop-2/branding/logo.png', heroImageUrl: heroUrl, accentColor: null }),
    );
    const r = await executeRemoveShopLogo({ shopId: 'shop-1' }, httpRequest);
    expect(r.ok).toBe(true);
    expect(updateShop).toHaveBeenCalledTimes(1);
    expect(deleteBlob).not.toHaveBeenCalled();
  });

  it('does not delete the file when the hero image uses the same URL', async () => {
    vi.mocked(findShopById).mockResolvedValue(makeShop({ logoUrl, heroImageUrl: logoUrl, accentColor: null }));
    const r = await executeRemoveShopLogo({ shopId: 'shop-1' }, httpRequest);
    expect(r.ok).toBe(true);
    expect(deleteBlob).not.toHaveBeenCalled();
  });

  it('still succeeds when deleting the file fails', async () => {
    vi.mocked(deleteBlob).mockRejectedValueOnce(new Error('boom'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await executeRemoveShopLogo({ shopId: 'shop-1' }, httpRequest);
    expect(spy).toHaveBeenCalledWith('[removeShopLogo] blob delete failed:', 'boom');
    spy.mockRestore();
    expect(r.ok).toBe(true);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.logo_remove' }));
  });
});
