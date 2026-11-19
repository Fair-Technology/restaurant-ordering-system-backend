import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
  updateShop: vi.fn(async (s: any) => s),
}));
vi.mock('../../../src/infrastructure/auth/superAdminAuthHelpers', () => ({ verifySuperAdminToken: vi.fn(async () => 'admin-1') }));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn() }));

import { findShopById, updateShop } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { executeApproveShopNameChange } from '../../../src/application/shop/approveShopNameChange/executeApproveShopNameChange';

function pending(requestedName: string, requestedSlug: string) {
  return { requestedName, requestedSlug, requestedBy: 'u1', requestedAt: '2026-11-01T00:00:00.000Z' };
}

describe('executeApproveShopNameChange retired slugs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retires the outgoing slug on a rename', async () => {
    (findShopById as any).mockResolvedValue({
      id: 'shop-1', name: 'Old', slug: 'old-name', pendingNameChange: pending('New Name', 'new-name'),
    });
    const res = await executeApproveShopNameChange({ shopId: 'shop-1' }, {} as any);

    expect(updateShop).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'new-name', previousSlugs: ['old-name'], pendingNameChange: null }),
    );
    expect(res.ok && res.data.slug).toBe('new-name');
  });

  it('keeps every earlier slug on a second rename', async () => {
    (findShopById as any).mockResolvedValue({
      id: 'shop-1', name: 'B', slug: 'b', previousSlugs: ['a'], pendingNameChange: pending('C', 'c'),
    });
    await executeApproveShopNameChange({ shopId: 'shop-1' }, {} as any);

    expect(updateShop).toHaveBeenCalledWith(expect.objectContaining({ slug: 'c', previousSlugs: ['a', 'b'] }));
  });

  it('lets a shop reclaim its own old slug, which leaves the retired list', async () => {
    (findShopById as any).mockResolvedValue({
      id: 'shop-1', name: 'B', slug: 'b', previousSlugs: ['a'], pendingNameChange: pending('A', 'a'),
    });
    await executeApproveShopNameChange({ shopId: 'shop-1' }, {} as any);

    expect(updateShop).toHaveBeenCalledWith(expect.objectContaining({ slug: 'a', previousSlugs: ['b'] }));
  });

  it('records the retired list in the audit trail', async () => {
    (findShopById as any).mockResolvedValue({
      id: 'shop-1', name: 'Old', slug: 'old-name', pendingNameChange: pending('New Name', 'new-name'),
    });
    await executeApproveShopNameChange({ shopId: 'shop-1' }, {} as any);

    const call = (logAudit as any).mock.calls[0][0];
    expect(call.changes.find((c: any) => c.field === 'previousSlugs')).toEqual({
      field: 'previousSlugs', from: [], to: ['old-name'],
    });
  });
});
