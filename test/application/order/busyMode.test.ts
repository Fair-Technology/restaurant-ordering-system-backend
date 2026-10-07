import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (a: any) => ({ actorType: a.actorType, actorId: a.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
  patchShopFields: vi.fn(async () => undefined),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn() }));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { executeSetBusyMode } from '../../../src/application/order/intake/executeSetBusyMode';
import { BUSY_MODE_BODY_ERROR } from '../../../src/domain/order/orderErrors';
import { findShopById, patchShopFields } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { CARD_SHOP } from '../../fixtures/orders';

const now = new Date('2026-10-05T10:05:00Z');
const http = {} as any;
const BUSY_ON = { extraMinutes: 20, serviceDate: '2026-10-05', startedAt: '2026-10-05T09:00:00.000Z' };

describe('executeSetBusyMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue({
      ok: true,
      actor: { actorType: 'staff', actorId: 's1', role: 'staff' },
      permissions: ['view_orders'],
    });
    (findShopById as any).mockResolvedValue(CARD_SHOP);
  });

  it('staff switch busy mode on for the rest of the service day', async () => {
    const res = await executeSetBusyMode({ shopId: 'shop-1', on: true }, http, { now });
    expect(patchShopFields).toHaveBeenCalledWith('shop-1', {
      busyMode: { extraMinutes: 20, serviceDate: '2026-10-05', startedAt: '2026-10-05T10:05:00.000Z' },
      updatedAt: '2026-10-05T10:05:00.000Z',
    });
    expect(res).toEqual({ ok: true, data: { active: true, extraMinutes: 20 } });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'shop.busy_mode',
        actorType: 'staff',
        actorId: 's1',
        changes: [{ field: 'busyMinutes', from: 0, to: 20 }],
      }),
    );
  });

  it("uses the restaurant's own busy minutes", async () => {
    (findShopById as any).mockResolvedValue({ ...CARD_SHOP, orderSettings: { busyExtraMinutes: 35 } });
    const res = await executeSetBusyMode({ shopId: 'shop-1', on: true }, http, { now });
    expect(res.ok && res.data.extraMinutes).toBe(35);
  });

  it('switching off clears it', async () => {
    (findShopById as any).mockResolvedValue({ ...CARD_SHOP, busyMode: BUSY_ON });
    const res = await executeSetBusyMode({ shopId: 'shop-1', on: false }, http, { now });
    expect(patchShopFields).toHaveBeenCalledWith('shop-1', { busyMode: null, updatedAt: '2026-10-05T10:05:00.000Z' });
    expect(res).toEqual({ ok: true, data: { active: false, extraMinutes: 20 } });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ changes: [{ field: 'busyMinutes', from: 20, to: 0 }] }),
    );
  });

  it("yesterday's busy mode counts as off", async () => {
    (findShopById as any).mockResolvedValue({ ...CARD_SHOP, busyMode: { ...BUSY_ON, serviceDate: '2026-10-04' } });
    const res = await executeSetBusyMode({ shopId: 'shop-1', on: false }, http, { now });
    expect(patchShopFields).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true, data: { active: false, extraMinutes: 20 } });
  });

  it('refuses a body without on', async () => {
    const res = await executeSetBusyMode({ shopId: 'shop-1', on: 'yes' }, http, { now });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: BUSY_MODE_BODY_ERROR });
    expect(findShopById).not.toHaveBeenCalled();
  });

  it("uses the board's permission and refuses others", async () => {
    const refusal = { ok: false, code: 'FORBIDDEN', error: 'You do not have access to this restaurant' };
    (authorizeShopAction as any).mockResolvedValue(refusal);
    const res = await executeSetBusyMode({ shopId: 'shop-1', on: true }, http, { now });
    expect(res).toEqual(refusal);
    expect(authorizeShopAction).toHaveBeenCalledWith(http, CARD_SHOP, 'view_orders');
  });
});
