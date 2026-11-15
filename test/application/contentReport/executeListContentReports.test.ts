import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/auth/superAdminAuthHelpers', () => ({ requirePlatform: vi.fn(async () => 'u1') }));
vi.mock('../../../src/infrastructure/cosmos/contentReport/CosmosContentReportRepository', () => ({
  findContentReports: vi.fn(async () => ({ reports: [], total: 0 })),
}));

import { requirePlatform } from '../../../src/infrastructure/auth/superAdminAuthHelpers';
import { findContentReports } from '../../../src/infrastructure/cosmos/contentReport/CosmosContentReportRepository';
import { executeListContentReports } from '../../../src/application/contentReport/listContentReports/executeListContentReports';

describe('executeListContentReports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requirePlatform as any).mockResolvedValue('u1');
  });

  it('refuses callers without platform access', async () => {
    (requirePlatform as any).mockResolvedValueOnce(null);
    expect(await executeListContentReports({}, {} as any)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(findContentReports).not.toHaveBeenCalled();
  });

  it('asks for read-level platform access', async () => {
    await executeListContentReports({}, {} as any);
    expect(requirePlatform).toHaveBeenCalledWith(expect.anything(), 'read');
  });

  it('passes a valid status filter and clamps paging', async () => {
    await executeListContentReports({ status: 'received', page: 0, pageSize: 500 }, {} as any);
    expect(findContentReports).toHaveBeenCalledWith({ status: 'received' }, 1, 100);
  });

  it('uses defaults and no filter when status is empty', async () => {
    await executeListContentReports({ status: '' }, {} as any);
    expect(findContentReports).toHaveBeenCalledWith({}, 1, 20);
  });

  it('rejects an unknown status', async () => {
    expect(await executeListContentReports({ status: 'open' as any }, {} as any)).toMatchObject({
      ok: false, code: 'INVALID_INPUT',
    });
    expect(findContentReports).not.toHaveBeenCalled();
  });

  it('returns the repository reports array as data', async () => {
    const reports = [{ id: 'r1' }, { id: 'r2' }];
    (findContentReports as any).mockResolvedValueOnce({ reports, total: 2 });
    expect(await executeListContentReports({}, {} as any)).toEqual({ ok: true, data: reports });
  });
});
