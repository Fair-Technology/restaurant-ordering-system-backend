import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/auth/superAdminAuthHelpers', () => ({
  verifySuperAdminToken: vi.fn(async () => 'admin-1'),
}));
vi.mock('../../../src/infrastructure/cosmos/user/CosmosUserRepository', () => ({
  findUserById: vi.fn(),
  patchUserLimits: vi.fn(),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn(async () => undefined) }));

import { verifySuperAdminToken } from '../../../src/infrastructure/auth/superAdminAuthHelpers';
import { findUserById, patchUserLimits } from '../../../src/infrastructure/cosmos/user/CosmosUserRepository';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { executeUpdateUserLimits } from '../../../src/application/user/updateUserLimits/executeUpdateUserLimits';

describe('executeUpdateUserLimits audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifySuperAdminToken as any).mockResolvedValue('admin-1');
    (findUserById as any).mockResolvedValue({ id: 'u1', email: 'u1@x.com', maxShops: 2 });
    (patchUserLimits as any).mockResolvedValue({ id: 'u1', email: 'u1@x.com', maxShops: 5 });
  });

  it('writes exactly one platform audit entry with the old and new limit', async () => {
    expect(await executeUpdateUserLimits('u1', { maxShops: 5 }, {} as any)).toEqual({
      ok: true, data: { userId: 'u1', maxShops: 5 },
    });
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 'platform',
        actorType: 'superadmin',
        actorId: 'admin-1',
        action: 'user.limits.update',
        entityType: 'user',
        entityId: 'u1',
        entityName: 'u1@x.com',
        changes: [{ field: 'maxShops', from: 2, to: 5 }],
      }),
    );
  });

  it('logs nothing for a missing user or non-superadmin', async () => {
    (patchUserLimits as any).mockResolvedValueOnce(null);
    expect(await executeUpdateUserLimits('u1', { maxShops: 5 }, {} as any)).toMatchObject({ code: 'NOT_FOUND' });
    (verifySuperAdminToken as any).mockResolvedValueOnce(null);
    expect(await executeUpdateUserLimits('u1', { maxShops: 5 }, {} as any)).toMatchObject({ code: 'FORBIDDEN' });
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('executeUpdateUserLimits input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifySuperAdminToken as any).mockResolvedValue('admin-1');
    (findUserById as any).mockResolvedValue({ id: 'u1', email: 'u1@x.com', maxShops: 2 });
    (patchUserLimits as any).mockResolvedValue({ id: 'u1', email: 'u1@x.com', maxShops: 5 });
  });

  it.each([
    ['a string', '5'],
    ['undefined', undefined],
  ])('rejects %s', async (_l, v) => {
    expect(await executeUpdateUserLimits('u1', { maxShops: v as any }, {} as any)).toMatchObject({
      ok: false, code: 'INVALID_INPUT',
    });
    expect(patchUserLimits).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it.each([2.5, -2, -5, NaN])('rejects %s', async (v) => {
    expect(await executeUpdateUserLimits('u1', { maxShops: v }, {} as any)).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'maxShops must be an integer >= -1 (use -1 for unlimited, null to use global default)',
    });
    expect(patchUserLimits).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it.each([
    ['-1 (unlimited)', -1],
    ['null (global default)', null],
  ])('accepts %s', async (_l, v) => {
    (patchUserLimits as any).mockResolvedValue({ id: 'u1', email: 'u1@x.com', maxShops: v });
    expect(await executeUpdateUserLimits('u1', { maxShops: v }, {} as any)).toEqual({
      ok: true, data: { userId: 'u1', maxShops: v },
    });
    expect(patchUserLimits).toHaveBeenCalledWith('u1', v);
    expect(logAudit).toHaveBeenCalledTimes(1);
  });
});
