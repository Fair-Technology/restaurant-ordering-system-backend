import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/auth/authHelpers', () => ({ getUserIdFromAuth: vi.fn(async () => 'u1') }));
vi.mock('../../../src/infrastructure/cosmos/user/CosmosUserRepository', () => ({ findUserById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
  findShopBySlug: vi.fn(async () => null),
  updateShop: vi.fn(async (s: any) => s),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn() }));

import { findUserById } from '../../../src/infrastructure/cosmos/user/CosmosUserRepository';
import { findShopById, findShopBySlug, updateShop } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { executeRestoreShop } from '../../../src/application/shop/restoreShop/executeRestoreShop';

describe('executeRestoreShop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findUserById as any).mockResolvedValue({ systemRole: 'superadmin' });
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
    (findUserById as any).mockResolvedValue({ systemRole: 'user' });
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
    (findShopBySlug as any).mockResolvedValueOnce({ id: 'shop-2', slug: 'pizzeria', isDeleted: false });
    const r = await executeRestoreShop({ shopId: 'shop-1' }, {} as any);
    expect(r).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(updateShop).not.toHaveBeenCalled();
  });
});
