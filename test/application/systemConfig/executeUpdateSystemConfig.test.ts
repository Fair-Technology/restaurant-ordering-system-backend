import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/auth/superAdminAuthHelpers', () => ({
  verifySuperAdminToken: vi.fn(async () => 'admin-1'),
}));
vi.mock('../../../src/infrastructure/cosmos/system/CosmosSystemConfigRepository', () => ({
  getSystemConfig: vi.fn(async () => ({ id: 'global', maxShopsDefault: 3 })),
  upsertSystemConfig: vi.fn(async (p: any) => ({ id: 'global', ...p })),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn(async () => undefined) }));

import { verifySuperAdminToken } from '../../../src/infrastructure/auth/superAdminAuthHelpers';
import { upsertSystemConfig } from '../../../src/infrastructure/cosmos/system/CosmosSystemConfigRepository';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { executeUpdateSystemConfig } from '../../../src/application/systemConfig/updateSystemConfig/executeUpdateSystemConfig';

describe('executeUpdateSystemConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifySuperAdminToken as any).mockResolvedValue('admin-1');
  });

  it.each([
    ['a string', '3'],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s', async (_l, v) => {
    expect(await executeUpdateSystemConfig({ maxShopsDefault: v as any }, {} as any)).toMatchObject({
      ok: false, code: 'INVALID_INPUT',
    });
  });

  it.each([2.5, 0, -1, -5, NaN])('rejects %s', async (v) => {
    expect(await executeUpdateSystemConfig({ maxShopsDefault: v }, {} as any)).toMatchObject({
      ok: false, code: 'INVALID_INPUT', error: 'maxShopsDefault must be an integer >= 1',
    });
    expect(upsertSystemConfig).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('refuses non-superadmins', async () => {
    (verifySuperAdminToken as any).mockResolvedValueOnce(null);
    expect(await executeUpdateSystemConfig({ maxShopsDefault: 2 }, {} as any)).toMatchObject({
      ok: false, code: 'FORBIDDEN',
    });
    expect(upsertSystemConfig).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('accepts 1 and writes exactly one platform audit entry with old and new value', async () => {
    expect(await executeUpdateSystemConfig({ maxShopsDefault: 1 }, {} as any)).toEqual({
      ok: true, data: { maxShopsDefault: 1 },
    });
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 'platform',
        actorType: 'superadmin',
        actorId: 'admin-1',
        action: 'config.maxShopsDefault.update',
        changes: [{ field: 'maxShopsDefault', from: 3, to: 1 }],
      }),
    );
  });
});
