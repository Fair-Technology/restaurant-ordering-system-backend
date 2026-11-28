import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
  isSlugReservedByAnother: vi.fn(async () => false),
  updateShop: vi.fn(async (s: any) => s),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn() }));
vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(async () => ({
    ok: true,
    actor: { actorType: 'owner', actorId: 'u1', role: 'owner' },
    permissions: [],
  })),
  toAuditActor: (a: any) => ({ actorType: a.actorType, actorId: a.actorId }),
}));

import { findShopById, isSlugReservedByAnother, updateShop } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { executeRequestShopNameChange } from '../../../src/application/shop/requestShopNameChange/executeRequestShopNameChange';

describe('executeRequestShopNameChange reserved slugs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findShopById as any).mockResolvedValue({ id: 'shop-1', name: 'Old', slug: 'old-name', previousSlugs: ['older'] });
  });

  it('refuses when the link is live or retired on another shop', async () => {
    (isSlugReservedByAnother as any).mockResolvedValueOnce(true);
    const res = await executeRequestShopNameChange({ shopId: 'shop-1', requestedName: 'Taken Name' }, {} as any);

    expect(res).toMatchObject({ ok: false, code: 'CONFLICT', errorCode: 'SHOP_NAME_EXISTS', field: 'name' });
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('stores the request, excluding the shop itself so it can reclaim its own old slug', async () => {
    (isSlugReservedByAnother as any).mockResolvedValueOnce(false);
    const res = await executeRequestShopNameChange({ shopId: 'shop-1', requestedName: 'Older' }, {} as any);

    expect(isSlugReservedByAnother).toHaveBeenCalledWith('older', 'shop-1');
    expect(res.ok).toBe(true);
    expect(updateShop).toHaveBeenCalledWith(
      expect.objectContaining({ pendingNameChange: expect.objectContaining({ requestedName: 'Older', requestedSlug: 'older' }) }),
    );
  });
});

describe('executeRequestShopNameChange name length and empty slug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findShopById as any).mockResolvedValue({ id: 'shop-1', name: 'Old', slug: 'old-name', previousSlugs: [] });
    (isSlugReservedByAnother as any).mockResolvedValue(false);
  });

  it('allows an 80-character name and rejects 81', async () => {
    const ok = await executeRequestShopNameChange({ shopId: 'shop-1', requestedName: 'a'.repeat(80) }, {} as any);
    expect(ok.ok).toBe(true);
    const bad = await executeRequestShopNameChange({ shopId: 'shop-1', requestedName: 'a'.repeat(81) }, {} as any);
    expect(bad).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'requestedName must be at most 80 characters long' });
  });

  it('refuses a name that generates an empty slug', async () => {
    const res = await executeRequestShopNameChange({ shopId: 'shop-1', requestedName: '寿司屋' }, {} as any);
    expect(res).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'Could not generate a link from this name; please choose one',
    });
    expect(updateShop).not.toHaveBeenCalled();
  });
});
