import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (a: any) => ({ actorType: a.actorType, actorId: a.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
  updateShop: vi.fn(async (s: any) => s),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn() }));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { executeUpdateOrderSettings } from '../../../src/application/shop/updateOrderSettings/executeUpdateOrderSettings';
import { findShopById, updateShop } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { CARD_SHOP, DINE_IN_SHOP } from '../../fixtures/orders';

const http = {} as any;

describe('executeUpdateOrderSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue({
      ok: true,
      actor: { actorType: 'owner', actorId: 'u1', role: 'owner' },
      permissions: ['manage_shop'],
    });
    (findShopById as any).mockResolvedValue(CARD_SHOP);
  });

  it('saves the settings', async () => {
    const res = await executeUpdateOrderSettings(
      { shopId: 'shop-1', body: { autoRejectMinutes: 15, alertEmail: ' Boss@MaPasta.example ' } },
      http,
    );
    expect(updateShop).toHaveBeenCalledWith(
      expect.objectContaining({ orderSettings: { autoRejectMinutes: 15, alertEmail: 'Boss@MaPasta.example', autoAccept: true, dineIn: false } }),
    );
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.order_settings_update' }));
    expect(JSON.stringify((logAudit as any).mock.calls)).not.toContain('MaPasta.example');
    expect(res).toEqual({ ok: true, data: { autoRejectMinutes: 15, alertEmail: 'Boss@MaPasta.example', autoAccept: true, dineIn: false } });
  });

  it('blank email clears it', async () => {
    const res = await executeUpdateOrderSettings({ shopId: 'shop-1', body: { autoRejectMinutes: 10, alertEmail: '' } }, http);
    expect(res).toEqual({ ok: true, data: { autoRejectMinutes: 10, alertEmail: null, autoAccept: true, dineIn: false } });
  });

  it('switches auto-accept off', async () => {
    const res = await executeUpdateOrderSettings(
      { shopId: 'shop-1', body: { autoRejectMinutes: 10, alertEmail: null, autoAccept: false } },
      http,
    );
    expect(res).toEqual({ ok: true, data: { autoRejectMinutes: 10, alertEmail: null, autoAccept: false, dineIn: false } });
    expect(updateShop).toHaveBeenCalledWith(expect.objectContaining({ orderSettings: expect.objectContaining({ autoAccept: false }) }));
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: expect.arrayContaining([{ field: 'autoAccept', from: true, to: false }]),
      }),
    );
  });

  it('refuses a non-boolean auto-accept', async () => {
    const res = await executeUpdateOrderSettings(
      { shopId: 'shop-1', body: { autoRejectMinutes: 10, alertEmail: null, autoAccept: 'no' as any } },
      http,
    );
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'autoAccept must be true or false' });
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('refuses 4 minutes', async () => {
    const res = await executeUpdateOrderSettings({ shopId: 'shop-1', body: { autoRejectMinutes: 4, alertEmail: null } }, http);
    expect(res).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'autoRejectMinutes must be a whole number between 5 and 30',
    });
  });

  it('refuses a bad email', async () => {
    const res = await executeUpdateOrderSettings({ shopId: 'shop-1', body: { autoRejectMinutes: 10, alertEmail: 'boss@' } }, http);
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'alertEmail must be a valid email address or null' });
  });

  it('switches dine-in on', async () => {
    const res = await executeUpdateOrderSettings(
      { shopId: 'shop-1', body: { autoRejectMinutes: 10, alertEmail: null, dineIn: true } },
      http,
    );
    expect(res).toEqual({ ok: true, data: { autoRejectMinutes: 10, alertEmail: null, autoAccept: true, dineIn: true } });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ changes: expect.arrayContaining([{ field: 'dineIn', from: false, to: true }]) }),
    );
  });

  it('keeps dine-in when the body leaves it out', async () => {
    (findShopById as any).mockResolvedValue(DINE_IN_SHOP);
    await executeUpdateOrderSettings({ shopId: 'shop-1', body: { autoRejectMinutes: 10, alertEmail: null } }, http);
    expect(updateShop).toHaveBeenCalledWith(
      expect.objectContaining({ orderSettings: expect.objectContaining({ dineIn: true }) }),
    );
  });

  it('refuses a non-boolean dine-in', async () => {
    const res = await executeUpdateOrderSettings(
      { shopId: 'shop-1', body: { autoRejectMinutes: 10, alertEmail: null, dineIn: 'yes' as any } },
      http,
    );
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'dineIn must be true or false' });
    expect(updateShop).not.toHaveBeenCalled();
  });
});
