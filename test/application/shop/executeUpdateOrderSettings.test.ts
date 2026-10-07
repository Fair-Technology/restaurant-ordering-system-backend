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
import {
  AUTO_ACCEPT_HOURS_ERROR,
  BUSY_MINUTES_ERROR,
  LAST_ORDERS_ERROR,
  PREP_SETTING_ERROR,
} from '../../../src/domain/order/orderErrors';
import { CARD_SHOP, DINE_IN_SHOP } from '../../fixtures/orders';

const http = {} as any;
const REST = {
  autoAcceptHours: null,
  prepMinutes: { collection: 20, delivery: 45, dine_in: 20 },
  lastOrdersMinutes: null,
  busyExtraMinutes: 20,
};

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
      expect.objectContaining({ orderSettings: { autoRejectMinutes: 15, alertEmail: 'Boss@MaPasta.example', autoAccept: true, dineIn: false, ...REST } }),
    );
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.order_settings_update' }));
    expect(JSON.stringify((logAudit as any).mock.calls)).not.toContain('MaPasta.example');
    expect(res).toEqual({ ok: true, data: { autoRejectMinutes: 15, alertEmail: 'Boss@MaPasta.example', autoAccept: true, dineIn: false, ...REST } });
  });

  it('blank email clears it', async () => {
    const res = await executeUpdateOrderSettings({ shopId: 'shop-1', body: { autoRejectMinutes: 10, alertEmail: '' } }, http);
    expect(res).toEqual({ ok: true, data: { autoRejectMinutes: 10, alertEmail: null, autoAccept: true, dineIn: false, ...REST } });
  });

  it('switches auto-accept off', async () => {
    const res = await executeUpdateOrderSettings(
      { shopId: 'shop-1', body: { autoRejectMinutes: 10, alertEmail: null, autoAccept: false } },
      http,
    );
    expect(res).toEqual({ ok: true, data: { autoRejectMinutes: 10, alertEmail: null, autoAccept: false, dineIn: false, ...REST } });
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
    expect(res).toEqual({ ok: true, data: { autoRejectMinutes: 10, alertEmail: null, autoAccept: true, dineIn: true, ...REST } });
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

  it('a card that sends only its own field keeps every other setting', async () => {
    (findShopById as any).mockResolvedValue({
      ...CARD_SHOP,
      orderSettings: {
        autoRejectMinutes: 15,
        alertEmail: 'boss@mapasta.example',
        autoAccept: false,
        dineIn: true,
        prepMinutes: { collection: 25 },
      },
    });
    await executeUpdateOrderSettings({ shopId: 'shop-1', body: { busyExtraMinutes: 30 } }, http);
    expect((updateShop as any).mock.calls[0][0].orderSettings).toEqual({
      autoRejectMinutes: 15,
      alertEmail: 'boss@mapasta.example',
      autoAccept: false,
      dineIn: true,
      autoAcceptHours: null,
      prepMinutes: { collection: 25, delivery: 45, dine_in: 20 },
      lastOrdersMinutes: null,
      busyExtraMinutes: 30,
    });
  });

  it('saves automatic hours', async () => {
    const res = await executeUpdateOrderSettings(
      { shopId: 'shop-1', body: { autoAcceptHours: { mon: [{ open: '09:00', close: '18:00' }] } as any } },
      http,
    );
    expect(res.ok && res.data.autoAcceptHours).toEqual({
      mon: [{ open: '09:00', close: '18:00' }],
      tue: [], wed: [], thu: [], fri: [], sat: [], sun: [],
    });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: expect.arrayContaining([{ field: 'autoAcceptHours', from: 'always', to: 'mon 09:00\u201318:00' }]),
      }),
    );
  });

  it('refuses malformed automatic hours', async () => {
    for (const hours of [{ mon: [{ open: '9am', close: '18:00' }] }, { mon: [{ open: '09:00', close: '09:00' }] }]) {
      const res = await executeUpdateOrderSettings({ shopId: 'shop-1', body: { autoAcceptHours: hours as any } }, http);
      expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: AUTO_ACCEPT_HOURS_ERROR });
    }
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('saves prep times and last orders', async () => {
    const res = await executeUpdateOrderSettings(
      { shopId: 'shop-1', body: { prepMinutes: { collection: 30 }, lastOrdersMinutes: 0 } },
      http,
    );
    expect(res.ok && res.data.prepMinutes).toEqual({ collection: 30, delivery: 45, dine_in: 20 });
    expect(res.ok && res.data.lastOrdersMinutes).toBe(0);
  });

  it('refuses kitchen timings out of range', async () => {
    const cases: [any, string][] = [
      [{ prepMinutes: { collection: 4 } }, PREP_SETTING_ERROR],
      [{ prepMinutes: { takeaway: 20 } }, PREP_SETTING_ERROR],
      [{ lastOrdersMinutes: 121 }, LAST_ORDERS_ERROR],
      [{ busyExtraMinutes: 0 }, BUSY_MINUTES_ERROR],
    ];
    for (const [body, error] of cases) {
      expect(await executeUpdateOrderSettings({ shopId: 'shop-1', body }, http)).toEqual({
        ok: false,
        code: 'INVALID_INPUT',
        error,
      });
    }
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('logs only the fields that changed, never the address', async () => {
    (findShopById as any).mockResolvedValue({
      ...CARD_SHOP,
      orderSettings: { autoRejectMinutes: 15, alertEmail: 'boss@mapasta.example' },
    });
    await executeUpdateOrderSettings(
      { shopId: 'shop-1', body: { autoRejectMinutes: 15, alertEmail: 'boss@mapasta.example', busyExtraMinutes: 30 } },
      http,
    );
    expect((logAudit as any).mock.calls[0][0].changes).toEqual([{ field: 'busyExtraMinutes', from: 20, to: 30 }]);
  });

  it('refuses a prep time list that is not an object, and an out-of-range dine-in time, saving nothing', async () => {
    for (const body of [{ prepMinutes: [20] }, { prepMinutes: null }, { prepMinutes: { collection: 20, dine_in: 121 } }, { prepMinutes: { collection: 20.5 } }]) {
      expect(await executeUpdateOrderSettings({ shopId: 'shop-1', body: body as any }, http)).toEqual({
        ok: false,
        code: 'INVALID_INPUT',
        error: PREP_SETTING_ERROR,
      });
    }
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('a later invalid field stops the save even when an earlier one is fine', async () => {
    const res = await executeUpdateOrderSettings({ shopId: 'shop-1', body: { dineIn: true, busyExtraMinutes: 121 } }, http);
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: BUSY_MINUTES_ERROR });
    expect(updateShop).not.toHaveBeenCalled();
  });
});
