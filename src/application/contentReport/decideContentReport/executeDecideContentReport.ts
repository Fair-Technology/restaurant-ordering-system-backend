import { HttpRequest } from '@azure/functions';
import {
  ContentReport,
  CONTENT_REPORT_DECISION_REASON_MAX_LENGTH,
} from '../../../domain/contentReport/ContentReport';
import {
  findContentReportById,
  replaceContentReport,
} from '../../../infrastructure/cosmos/contentReport/CosmosContentReportRepository';
import { verifySuperAdminToken } from '../../../infrastructure/auth/superAdminAuthHelpers';
import { logAudit } from '../../_shared/auditHelpers';
import { ApplicationResult } from '../../_shared/types';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import { DecideContentReportBody } from './dtos';

/**
 * Platform staff (write level): records the platform's decision on a content report, once.
 * Taking the shop down is the separate suspend switch (executeSetShopOfflineBySuperadmin).
 */
export async function executeDecideContentReport(
  reportId: string,
  body: DecideContentReportBody,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ContentReport>> {
  if (!reportId || typeof reportId !== 'string' || reportId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'reportId is required and must be a non-empty string' };
  }
  if (body?.decision !== 'actioned' && body?.decision !== 'dismissed') {
    return { ok: false, code: 'INVALID_INPUT', error: "decision must be 'actioned' or 'dismissed'" };
  }
  if (typeof body.reason !== 'string' || body.reason.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'reason is required and must be a non-empty string' };
  }
  const reason = body.reason.trim();
  if (reason.length > CONTENT_REPORT_DECISION_REASON_MAX_LENGTH) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: `reason must be at most ${CONTENT_REPORT_DECISION_REASON_MAX_LENGTH} characters`,
    };
  }

  try {
    const actorId = await verifySuperAdminToken(httpRequest);
    if (!actorId) {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }

    const report = await findContentReportById(reportId.trim());
    if (!report) return { ok: false, code: 'NOT_FOUND', error: 'Content report not found' };

    if (report.status !== 'received') {
      return { ok: false, code: 'CONFLICT', error: 'This report has already been decided' };
    }

    const updated = await replaceContentReport({
      ...report,
      status: body.decision,
      decision: {
        decision: body.decision,
        reason,
        decidedBy: actorId,
        decidedAt: new Date().toISOString(),
      },
    });

    await logAudit({
      shopId: report.shopId,
      actorType: 'superadmin',
      actorId,
      action: 'content_report.decided',
      entityType: 'content_report',
      entityId: report.id,
      entityName: report.shopName,
      changes: [{ field: 'status', from: 'received', to: body.decision }],
    });

    return { ok: true, data: updated };
  } catch (error) {
    logServiceFailure('decideContentReport', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to record the decision' };
  }
}
