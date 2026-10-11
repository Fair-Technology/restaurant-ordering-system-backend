import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/auth/authHelpers', () => ({ getUserIdFromAuth: vi.fn(async () => 'u1') }));
vi.mock('../../../src/infrastructure/cosmos/user/CosmosUserRepository', () => ({ findUserById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
  updateShop: vi.fn(async (s: any) => s),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn() }));

import { findUserById } from '../../../src/infrastructure/cosmos/user/CosmosUserRepository';
import { findShopById, updateShop } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { executeSetShopOfflineBySuperadmin } from '../../../src/application/shop/setShopOfflineBySuperadmin/executeSetShopOfflineBySuperadmin';
import { mapResultToHttp } from '../../../src/functions/_shared/mapResultToHttp';

describe('executeSetShopOfflineBySuperadmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findUserById as any).mockResolvedValue({ systemRole: 'superadmin' });
    (findShopById as any).mockResolvedValue({ id: 'shop-1', name: 'Pizzeria', isPaused: false });
  });

  it('sets offline with a reason and audits it', async () => {
    const r = await executeSetShopOfflineBySuperadmin({ shopId: 'shop-1', offline: true, reason: ' unpaid ' }, {} as any);
    expect(r).toMatchObject({ ok: true, data: { offlineBySuperadmin: true, offlineBySuperadminReason: 'unpaid' } });
    expect(updateShop).toHaveBeenCalledWith(
      expect.objectContaining({ offlineBySuperadmin: true, offlineBySuperadminReason: 'unpaid' }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'shop.offline_by_superadmin', actorType: 'superadmin' }),
    );
  });

  it('clears offline and drops the reason', async () => {
    (findShopById as any).mockResolvedValue({
      id: 'shop-1', name: 'Pizzeria', offlineBySuperadmin: true, offlineBySuperadminReason: 'unpaid',
    });
    const r = await executeSetShopOfflineBySuperadmin({ shopId: 'shop-1', offline: false }, {} as any);
    expect(r.ok).toBe(true);
    const saved = (updateShop as any).mock.calls[0][0];
    expect(saved.offlineBySuperadmin).toBe(false);
    expect('offlineBySuperadminReason' in saved).toBe(false);
  });

  it('refuses anyone who is not superadmin', async () => {
    (findUserById as any).mockResolvedValue({ systemRole: 'user' });
    const r = await executeSetShopOfflineBySuperadmin({ shopId: 'shop-1', offline: true }, {} as any);
    expect(r).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('validates the body and finds the shop', async () => {
    expect(await executeSetShopOfflineBySuperadmin({ shopId: 'shop-1', offline: 'x' as any }, {} as any)).toMatchObject({
      ok: false, code: 'INVALID_INPUT',
    });
    (findShopById as any).mockResolvedValue(null);
    expect(await executeSetShopOfflineBySuperadmin({ shopId: 'nope', offline: true }, {} as any)).toMatchObject({
      ok: false, code: 'NOT_FOUND',
    });
  });

  it('maps the new codes to 409 with a code in the body', () => {
    expect(mapResultToHttp({ ok: false, code: 'SHOP_OFFLINE_BY_SUPERADMIN', error: 'e' })).toMatchObject({
      status: 409, jsonBody: { code: 'SHOP_OFFLINE_BY_SUPERADMIN' },
    });
    expect(mapResultToHttp({ ok: false, code: 'ORDERS_PAUSED', error: 'e' })).toMatchObject({
      status: 409, jsonBody: { code: 'ORDERS_PAUSED' },
    });
  });
});
