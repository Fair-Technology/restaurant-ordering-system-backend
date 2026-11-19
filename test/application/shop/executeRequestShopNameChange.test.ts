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

  it('refuses when the web address is live or retired on another shop', async () => {
    (isSlugReservedByAnother as any).mockResolvedValueOnce(true);
    const res = await executeRequestShopNameChange({ shopId: 'shop-1', requestedName: 'Taken Name' }, {} as any);

    expect(res).toMatchObject({ ok: false, code: 'CONFLICT' });
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
