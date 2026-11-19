import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/auth/superAdminAuthHelpers', () => ({ verifySuperAdminToken: vi.fn(async () => 'u1') }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
  isSlugReservedByAnother: vi.fn(async () => false),
  updateShop: vi.fn(async (s: any) => s),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn() }));

import { findShopById, isSlugReservedByAnother, updateShop } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { executeRestoreShop } from '../../../src/application/shop/restoreShop/executeRestoreShop';
import { verifySuperAdminToken } from '../../../src/infrastructure/auth/superAdminAuthHelpers';

describe('executeRestoreShop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifySuperAdminToken as any).mockResolvedValue('u1');
    (findShopById as any).mockResolvedValue({
      id: 'shop-1', name: 'Pizzeria', isDeleted: true, deletedAt: '2026-10-11T00:00:00Z', deletedBy: 'owner-1',
    });
  });

  it('superadmin restores: delete fields cleared, audit written', async () => {
    const r = await executeRestoreShop({ shopId: 'shop-1' }, {} as any);
    expect(r.ok).toBe(true);
    const saved = (updateShop as any).mock.calls[0][0];
    expect(saved.isDeleted).toBe(false);
    expect('deletedAt' in saved).toBe(false);
    expect('deletedBy' in saved).toBe(false);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.restore', actorType: 'superadmin' }));
  });

  it('anyone else gets 403', async () => {
    (verifySuperAdminToken as any).mockResolvedValueOnce(null);
    const r = await executeRestoreShop({ shopId: 'shop-1' }, {} as any);
    expect(r).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('a shop that is not deleted is a conflict', async () => {
    (findShopById as any).mockResolvedValue({ id: 'shop-1', isDeleted: false });
    expect(await executeRestoreShop({ shopId: 'shop-1' }, {} as any)).toMatchObject({ ok: false, code: 'CONFLICT' });
  });

  it('refuses when another live shop now uses the same web address', async () => {
    (findShopById as any).mockResolvedValue({ id: 'shop-1', name: 'Pizzeria', slug: 'pizzeria', isDeleted: true });
    (isSlugReservedByAnother as any).mockResolvedValueOnce(true);
    const r = await executeRestoreShop({ shopId: 'shop-1' }, {} as any);
    expect(r).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(updateShop).not.toHaveBeenCalled();
  });
});
