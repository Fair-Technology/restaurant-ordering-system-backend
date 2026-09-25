import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (actor: any) => ({ actorType: actor.actorType, actorId: actor.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(async () => ({ id: 'shop-1' })),
}));
vi.mock('../../../src/infrastructure/cosmos/staff/CosmosStaffAccountRepository', () => ({
  findStaffAccountById: vi.fn(),
  replaceStaffAccount: vi.fn(),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({
  logAudit: vi.fn(),
}));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import {
  findStaffAccountById,
  replaceStaffAccount,
} from '../../../src/infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { executeDeleteStaff } from '../../../src/application/staff/deleteStaff/executeDeleteStaff';

const ownerAccess = {
  ok: true,
  actor: { actorType: 'owner', actorId: 'u-owner', role: 'owner' },
  permissions: ['manage_staff'],
};
const managerAccess = {
  ok: true,
  actor: { actorType: 'staff', actorId: 'st-mgr', role: 'manager' },
  permissions: ['manage_staff'],
};

const staffAccount = {
  id: 'st-1',
  shopId: 'shop-1',
  username: 'kitchen',
  displayName: 'Kitchen',
  role: 'staff',
  passwordHash: 'scrypt$16384$8$1$xxx$yyy',
  isActive: true,
  isDeleted: false,
  failedLoginCount: 0,
  lockedUntil: null,
  lastLoginAt: null,
  createdBy: 'u-owner',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('executeDeleteStaff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (replaceStaffAccount as any).mockImplementation(async (a: any) => a);
  });

  it('blanks identity', async () => {
    (authorizeShopAction as any).mockResolvedValue(ownerAccess);
    (findStaffAccountById as any).mockResolvedValue(staffAccount);

    const result = await executeDeleteStaff({ shopId: 'shop-1', staffId: 'st-1' }, {} as any);

    expect(result.ok).toBe(true);
    expect(replaceStaffAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'deleted.st-1',
        displayName: null,
        passwordHash: '',
        isActive: false,
        isDeleted: true,
      }),
    );
  });

  it('manager cannot delete a manager', async () => {
    (authorizeShopAction as any).mockResolvedValue(managerAccess);
    (findStaffAccountById as any).mockResolvedValue({ ...staffAccount, role: 'manager' });

    const result = await executeDeleteStaff({ shopId: 'shop-1', staffId: 'st-1' }, {} as any);

    expect(result).toEqual({ ok: false, code: 'FORBIDDEN', error: 'Managers can only manage staff logins' });
    expect(replaceStaffAccount).not.toHaveBeenCalled();
  });
});
