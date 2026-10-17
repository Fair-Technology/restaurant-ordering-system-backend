import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/auth/authHelpers', () => ({ getUserIdFromAuth: vi.fn(async () => 'u1') }));
vi.mock('../../../src/infrastructure/cosmos/user/CosmosUserRepository', () => ({ findUserById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
  patchShopFields: vi.fn(async () => undefined),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn() }));

import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { executeSetMissedOrdersPauseLimit } from '../../../src/application/shop/setMissedOrdersPauseLimit/executeSetMissedOrdersPauseLimit';
import { findShopById, patchShopFields } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { findUserById } from '../../../src/infrastructure/cosmos/user/CosmosUserRepository';

const now = new Date('2026-10-17T12:00:00Z');

describe('executeSetMissedOrdersPauseLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findUserById as any).mockResolvedValue({ systemRole: 'superadmin' });
    (findShopById as any).mockResolvedValue({ id: 'shop-1', name: 'Pizzeria' });
  });

  it('sets the limit and audits it', async () => {
    const r = await executeSetMissedOrdersPauseLimit({ shopId: 'shop-1', limit: 5 }, {} as any, { now });
    expect(r).toEqual({ ok: true, data: { missedOrdersPauseLimit: 5 } });
    expect(patchShopFields).toHaveBeenCalledWith('shop-1', { missedOrdersPauseLimit: 5, updatedAt: '2026-10-17T12:00:00.000Z' });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ changes: [{ field: 'missedOrdersPauseLimit', from: 3, to: 5 }] }),
    );
  });

  it('0 switches it off', async () => {
    const r = await executeSetMissedOrdersPauseLimit({ shopId: 'shop-1', limit: 0 }, {} as any, { now });
    expect(r).toEqual({ ok: true, data: { missedOrdersPauseLimit: 0 } });
    expect(patchShopFields).toHaveBeenCalledWith('shop-1', expect.objectContaining({ missedOrdersPauseLimit: 0 }));
  });

  it.each([11, -1, 2.5, '3'])('refuses %s', async (limit) => {
    const r = await executeSetMissedOrdersPauseLimit({ shopId: 'shop-1', limit }, {} as any, { now });
    expect(r).toMatchObject({ ok: false, code: 'INVALID_INPUT', error: 'limit must be a whole number from 0 (off) to 10' });
    expect(patchShopFields).not.toHaveBeenCalled();
  });

  it('refuses a non-superadmin', async () => {
    (findUserById as any).mockResolvedValue({ systemRole: 'user' });
    const r = await executeSetMissedOrdersPauseLimit({ shopId: 'shop-1', limit: 2 }, {} as any, { now });
    expect(r).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(patchShopFields).not.toHaveBeenCalled();
  });

  it('says so when the shop does not exist', async () => {
    (findShopById as any).mockResolvedValue(null);
    const r = await executeSetMissedOrdersPauseLimit({ shopId: 'nope', limit: 2 }, {} as any, { now });
    expect(r).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});
