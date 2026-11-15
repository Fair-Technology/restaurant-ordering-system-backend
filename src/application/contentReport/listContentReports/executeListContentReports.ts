import { HttpRequest } from '@azure/functions';
import { ContentReport, ContentReportStatus } from '../../../domain/contentReport/ContentReport';
import { findContentReports } from '../../../infrastructure/cosmos/contentReport/CosmosContentReportRepository';
import { requirePlatform } from '../../../infrastructure/auth/superAdminAuthHelpers';
import { ApplicationResult } from '../../_shared/types';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import { ListContentReportsRequestDto } from './dtos';

const STATUSES: readonly ContentReportStatus[] = ['received', 'actioned', 'dismissed'];

/** Platform staff (read level): content reports, newest first, optionally by status. */
export async function executeListContentReports(
  query: ListContentReportsRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ContentReport[]>> {
  const actor = await requirePlatform(httpRequest, 'read');
  if (!actor) return { ok: false, code: 'FORBIDDEN', error: 'Platform access required' };

  let status: ContentReportStatus | undefined;
  if (query.status !== undefined && query.status !== '') {
    if (!(STATUSES as readonly unknown[]).includes(query.status)) {
      return { ok: false, code: 'INVALID_INPUT', error: 'status must be one of: received, actioned, dismissed' };
    }
    status = query.status;
  }

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

  try {
    const { reports } = await findContentReports(status ? { status } : {}, page, pageSize);
    return { ok: true, data: reports };
  } catch (error) {
    logServiceFailure('listContentReports', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve content reports' };
  }
}
