import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/auth/superAdminAuthHelpers', () => ({ verifySuperAdminToken: vi.fn(async () => 'admin-1') }));
vi.mock('../../../src/infrastructure/cosmos/contentReport/CosmosContentReportRepository', () => ({
  findContentReportById: vi.fn(),
  replaceContentReport: vi.fn(async (r: any) => r),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn() }));

import { verifySuperAdminToken } from '../../../src/infrastructure/auth/superAdminAuthHelpers';
import {
  findContentReportById,
  replaceContentReport,
} from '../../../src/infrastructure/cosmos/contentReport/CosmosContentReportRepository';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { executeDecideContentReport } from '../../../src/application/contentReport/decideContentReport/executeDecideContentReport';
import { CONTENT_REPORT_DECISION_REASON_MAX_LENGTH } from '../../../src/domain/contentReport/ContentReport';

const REPORT = {
  id: 'rep-1',
  shopId: 'shop-1',
  shopSlug: 'pizzeria',
  shopName: 'Pizzeria',
  category: 'illegal_goods',
  reason: 'bad',
  status: 'received',
  receivedAt: '2026-11-01T00:00:00.000Z',
};

describe('executeDecideContentReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifySuperAdminToken as any).mockResolvedValue('admin-1');
    (findContentReportById as any).mockResolvedValue({ ...REPORT });
  });

  it('records an actioned decision and audits it', async () => {
    const r = await executeDecideContentReport(' rep-1 ', { decision: 'actioned', reason: ' clearly illegal ' }, {} as any);
    expect(findContentReportById).toHaveBeenCalledWith('rep-1');
    expect(r.ok).toBe(true);
    const saved = (replaceContentReport as any).mock.calls[0][0];
    expect(saved.status).toBe('actioned');
    expect(saved.decision).toMatchObject({ decision: 'actioned', reason: 'clearly illegal', decidedBy: 'admin-1' });
    expect(new Date(saved.decision.decidedAt).toISOString()).toBe(saved.decision.decidedAt);
    expect(r).toEqual({ ok: true, data: saved });
    expect(logAudit).toHaveBeenCalledWith({
      shopId: 'shop-1',
      actorType: 'superadmin',
      actorId: 'admin-1',
      action: 'content_report.decided',
      entityType: 'content_report',
      entityId: 'rep-1',
      entityName: 'Pizzeria',
      changes: [{ field: 'status', from: 'received', to: 'actioned' }],
    });
  });

  it('refuses to rewrite an existing decision', async () => {
    (findContentReportById as any).mockResolvedValueOnce({ ...REPORT, status: 'dismissed' });
    const r = await executeDecideContentReport('rep-1', { decision: 'actioned', reason: 'x' }, {} as any);
    expect(r).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(replaceContentReport).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('refuses anyone who is not a write-level platform operator', async () => {
    (verifySuperAdminToken as any).mockResolvedValueOnce(null);
    const r = await executeDecideContentReport('rep-1', { decision: 'dismissed', reason: 'x' }, {} as any);
    expect(r).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(findContentReportById).not.toHaveBeenCalled();
    expect(replaceContentReport).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND for a missing report', async () => {
    (findContentReportById as any).mockResolvedValueOnce(null);
    const r = await executeDecideContentReport('nope', { decision: 'dismissed', reason: 'x' }, {} as any);
    expect(r).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it.each([
    ['empty reportId', '', { decision: 'actioned', reason: 'x' }],
    ['unknown decision', 'rep-1', { decision: 'received', reason: 'x' }],
    ['missing decision', 'rep-1', { reason: 'x' }],
    ['blank reason', 'rep-1', { decision: 'actioned', reason: '  ' }],
    ['oversized reason', 'rep-1', { decision: 'actioned', reason: 'a'.repeat(CONTENT_REPORT_DECISION_REASON_MAX_LENGTH + 1) }],
  ])('rejects %s with INVALID_INPUT', async (_label, id, body) => {
    const r = await executeDecideContentReport(id as string, body as any, {} as any);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(replaceContentReport).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });
});
