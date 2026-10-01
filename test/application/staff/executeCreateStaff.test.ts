import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (actor: any) => ({ actorType: actor.actorType, actorId: actor.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(async () => ({ id: 'shop-1' })),
}));
vi.mock('../../../src/infrastructure/cosmos/staff/CosmosStaffAccountRepository', () => ({
  listStaffAccounts: vi.fn(),
  createStaffAccount: vi.fn(),
}));
vi.mock('../../../src/application/_shared/planLimits', () => ({
  getPlanLimitForShop: vi.fn(),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({
  logAudit: vi.fn(),
}));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import {
  listStaffAccounts,
  createStaffAccount,
} from '../../../src/infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { getPlanLimitForShop } from '../../../src/application/_shared/planLimits';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { executeCreateStaff } from '../../../src/application/staff/createStaff/executeCreateStaff';

const ownerAccess = {
  ok: true,
  actor: { actorType: 'owner', actorId: 'u-owner', role: 'owner' },
  permissions: ['view_orders', 'manage_menu', 'manage_shop', 'manage_staff', 'manage_billing', 'view_audit'],
};
const managerAccess = {
  ok: true,
  actor: { actorType: 'staff', actorId: 'st-mgr', role: 'manager' },
  permissions: ['view_orders', 'manage_menu', 'manage_staff', 'view_audit'],
};

const activeAccounts = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, isActive: true }));

describe('executeCreateStaff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createStaffAccount as any).mockImplementation(async (acc: any) => acc);
  });

  it('owner creates a staff login', async () => {
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    (listStaffAccounts as any).mockResolvedValue(activeAccounts(2));
    (getPlanLimitForShop as any).mockResolvedValue(5);

    const result = await executeCreateStaff(
      { shopId: 'shop-1', username: 'Kitchen', password: 'longenough1', role: 'staff' },
      {} as any,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.username).toBe('kitchen');
      expect(result.data).not.toHaveProperty('passwordHash');
    }
    expect(createStaffAccount).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: expect.stringMatching(/^scrypt\$/) }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'staff.create', actorType: 'owner', actorId: 'u-owner' }),
    );
  });

  it('cap reached', async () => {
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    (listStaffAccounts as any).mockResolvedValue(activeAccounts(5));
    (getPlanLimitForShop as any).mockResolvedValue(5);

    const result = await executeCreateStaff(
      { shopId: 'shop-1', username: 'kitchen2', password: 'longenough1', role: 'staff' },
      {} as any,
    );

    expect(result).toEqual({ ok: false, code: 'LIMIT_REACHED', error: 'Your plan allows 5 staff logins.' });
  });

  it('unlimited plan', async () => {
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    (listStaffAccounts as any).mockResolvedValue(activeAccounts(9));
    (getPlanLimitForShop as any).mockResolvedValue(-1);

    const result = await executeCreateStaff(
      { shopId: 'shop-1', username: 'kitchen3', password: 'longenough1', role: 'staff' },
      {} as any,
    );

    expect(result.ok).toBe(true);
  });

  it('manager cannot create managers', async () => {
    (authorizeShopAction as any).mockResolvedValue(managerAccess);
    (listStaffAccounts as any).mockResolvedValue(activeAccounts(1));
    (getPlanLimitForShop as any).mockResolvedValue(5);

    const result = await executeCreateStaff(
      { shopId: 'shop-1', username: 'newmanager', password: 'longenough1', role: 'manager' },
      {} as any,
    );

    expect(result).toEqual({ ok: false, code: 'FORBIDDEN', error: 'Managers can only manage staff logins' });
  });

  it('short username', async () => {
    const result = await executeCreateStaff(
      { shopId: 'shop-1', username: 'ab', password: 'longenough1', role: 'staff' },
      {} as any,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_INPUT');
  });

  it('short password', async () => {
    const result = await executeCreateStaff(
      { shopId: 'shop-1', username: 'kitchen', password: 'short', role: 'staff' },
      {} as any,
    );
    expect(result).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'password must be between 8 and 128 characters',
    });
  });

  it('taken username', async () => {
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    (listStaffAccounts as any).mockResolvedValue(activeAccounts(1));
    (getPlanLimitForShop as any).mockResolvedValue(5);
    (createStaffAccount as any).mockRejectedValue({ code: 409 });

    const result = await executeCreateStaff(
      { shopId: 'shop-1', username: 'kitchen', password: 'longenough1', role: 'staff' },
      {} as any,
    );

    expect(result).toEqual({
      ok: false,
      code: 'CONFLICT',
      error: 'That username is already taken in this restaurant',
    });
  });
});
