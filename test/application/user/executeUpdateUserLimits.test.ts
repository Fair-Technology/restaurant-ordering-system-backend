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
