import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/auth/superAdminAuthHelpers', () => ({ requirePlatform: vi.fn(async () => 'admin-1') }));
vi.mock('../../../src/infrastructure/cosmos/system/CosmosSystemConfigRepository', () => ({ getSystemConfig: vi.fn() }));
vi.mock('../../../src/infrastructure/email/emailSender', () => ({ emailTransportName: vi.fn(() => 'log') }));

import { requirePlatform } from '../../../src/infrastructure/auth/superAdminAuthHelpers';
import { getSystemConfig } from '../../../src/infrastructure/cosmos/system/CosmosSystemConfigRepository';
import { emailTransportName } from '../../../src/infrastructure/email/emailSender';
import { executeGetSystemConfig } from '../../../src/application/systemConfig/getSystemConfig/executeGetSystemConfig';

describe('executeGetSystemConfig', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [true, 'acs', true, true],
    [true, 'log', true, false],
    [false, 'acs', false, true],
    [false, 'log', false, false],
  ] as const)('switch %s + transport %s', async (enabled, transport, emailEnabled, emailTransportConfigured) => {
    vi.mocked(getSystemConfig).mockResolvedValue({ id: 'global', maxShopsDefault: 3, emailEnabled, scheduleHorizonDays: 5, updatedAt: 'x' });
    vi.mocked(emailTransportName).mockReturnValue(transport);
    expect(await executeGetSystemConfig({} as any)).toEqual({
      ok: true,
      data: { maxShopsDefault: 3, emailEnabled, scheduleHorizonDays: 5, emailTransportConfigured },
    });
  });

  it('still requires platform access', async () => {
    vi.mocked(requirePlatform).mockResolvedValueOnce(null as any);
    expect(await executeGetSystemConfig({} as any)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});
