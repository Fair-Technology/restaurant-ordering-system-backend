import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/auth/superAdminAuthHelpers', () => ({ verifySuperAdminToken: vi.fn(async () => 'u1') }));
vi.mock('../../../src/infrastructure/cosmos/system/CosmosPlatformLegalIdentityRepository', () => ({
  getPlatformLegalIdentity: vi.fn(),
  savePlatformLegalIdentity: vi.fn(),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({
  logAudit: vi.fn(),
  diffFields: vi.fn(() => []),
}));

import {
  getPlatformLegalIdentity,
  savePlatformLegalIdentity,
} from '../../../src/infrastructure/cosmos/system/CosmosPlatformLegalIdentityRepository';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { DEFAULT_PLATFORM_LEGAL_IDENTITY } from '../../../src/domain/legal/PlatformLegalIdentity';
import { executeUpdatePlatformLegalIdentity } from '../../../src/application/legal/updatePlatformLegalIdentity/executeUpdatePlatformLegalIdentity';
import { COMPLETE_IDENTITY } from '../../fixtures/legal';
import { verifySuperAdminToken } from '../../../src/infrastructure/auth/superAdminAuthHelpers';

describe('executeUpdatePlatformLegalIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifySuperAdminToken as any).mockResolvedValue('u1');
    (getPlatformLegalIdentity as any).mockImplementation(async () => structuredClone(DEFAULT_PLATFORM_LEGAL_IDENTITY));
    (savePlatformLegalIdentity as any).mockImplementation(async (d: any) => d);
  });

  it('non-superadmin is refused', async () => {
    (verifySuperAdminToken as any).mockResolvedValueOnce(null);
    const r = await executeUpdatePlatformLegalIdentity({ body: {} }, {} as any);
    expect(r).toEqual({ ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' });
    expect(savePlatformLegalIdentity).not.toHaveBeenCalled();
  });

  it('rejects a non-https sales site URL', async () => {
    const r = await executeUpdatePlatformLegalIdentity(
      {
        body: {
          platformName: 'X',
          salesSiteUrl: 'http://x.example',
          operator: { legalName: '', address: '', email: '' },
          euRepresentative: null,
        },
      },
      {} as any,
    );
    expect(r).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'salesSiteUrl must be an https URL or null' });
  });

  it('saves and audits', async () => {
    const r = await executeUpdatePlatformLegalIdentity(
      {
        body: {
          platformName: 'Fair Technology',
          salesSiteUrl: 'https://fair.example',
          operator: COMPLETE_IDENTITY.operator,
          euRepresentative: null,
        },
        now: new Date('2026-10-01T12:00:00Z'),
      },
      {} as any,
    );
    expect(r.ok).toBe(true);
    expect(savePlatformLegalIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'platform_legal_identity',
        updatedBy: 'u1',
        updatedAt: '2026-10-01T12:00:00.000Z',
      }),
    );
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'platform_legal_identity.update' }));
    if (r.ok) expect('id' in r.data).toBe(false);
  });
});
