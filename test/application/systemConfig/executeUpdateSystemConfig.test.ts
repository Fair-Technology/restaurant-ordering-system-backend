import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/auth/superAdminAuthHelpers', () => ({
  verifySuperAdminToken: vi.fn(async () => 'admin-1'),
}));
vi.mock('../../../src/infrastructure/cosmos/system/CosmosSystemConfigRepository', () => ({
  getSystemConfig: vi.fn(async () => ({ id: 'global', maxShopsDefault: 3, emailEnabled: false })),
  upsertSystemConfig: vi.fn(async (p: any) => ({ id: 'global', maxShopsDefault: 3, emailEnabled: false, ...p })),
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
      ok: true, data: { maxShopsDefault: 1, emailEnabled: false },
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

  it('maxShopsDefault alone sends a patch with only that field', async () => {
    await executeUpdateSystemConfig({ maxShopsDefault: 5 }, {} as any);
    expect(upsertSystemConfig).toHaveBeenCalledWith({ maxShopsDefault: 5 });
  });

  it('emailEnabled alone sends a patch with only that field and audits once', async () => {
    expect(await executeUpdateSystemConfig({ emailEnabled: true }, {} as any)).toEqual({
      ok: true, data: { maxShopsDefault: 3, emailEnabled: true },
    });
    expect(upsertSystemConfig).toHaveBeenCalledWith({ emailEnabled: true });
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 'platform',
        actorType: 'superadmin',
        actorId: 'admin-1',
        action: 'config.emailEnabled.update',
        entityType: 'systemConfig',
        entityId: 'global',
        changes: [{ field: 'emailEnabled', from: false, to: true }],
      }),
    );
  });

  it('both fields in one call write one patch and two audit entries', async () => {
    await executeUpdateSystemConfig({ maxShopsDefault: 4, emailEnabled: true }, {} as any);
    expect(upsertSystemConfig).toHaveBeenCalledTimes(1);
    expect(upsertSystemConfig).toHaveBeenCalledWith({ maxShopsDefault: 4, emailEnabled: true });
    expect(vi.mocked(logAudit).mock.calls.map((c) => c[0].action)).toEqual([
      'config.maxShopsDefault.update',
      'config.emailEnabled.update',
    ]);
  });

  it('does not audit a field that was sent but did not change', async () => {
    await executeUpdateSystemConfig({ emailEnabled: false }, {} as any);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it.each([['a string', 'true'], ['a number', 1], ['null', null]])('rejects emailEnabled as %s', async (_l, v) => {
    expect(await executeUpdateSystemConfig({ emailEnabled: v as any }, {} as any)).toEqual({
      ok: false, code: 'INVALID_INPUT', error: 'emailEnabled must be a boolean',
    });
    expect(upsertSystemConfig).not.toHaveBeenCalled();
  });

  it('rejects a request with no fields', async () => {
    expect(await executeUpdateSystemConfig({}, {} as any)).toEqual({
      ok: false, code: 'INVALID_INPUT', error: 'No fields to update',
    });
  });

  it('refuses non-superadmins for an emailEnabled change too', async () => {
    (verifySuperAdminToken as any).mockResolvedValueOnce(null);
    expect(await executeUpdateSystemConfig({ emailEnabled: true }, {} as any)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(upsertSystemConfig).not.toHaveBeenCalled();
  });
});
