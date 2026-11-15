import {
  ContentReport,
  CONTENT_REPORT_REASON_MAX_LENGTH,
  CONTENT_REPORT_URL_MAX_LENGTH,
  CONTENT_REPORTER_EMAIL_MAX_LENGTH,
  CONTENT_REPORTER_NAME_MAX_LENGTH,
  isContentReportCategory,
} from '../../../domain/contentReport/ContentReport';
import { createContentReport } from '../../../infrastructure/cosmos/contentReport/CosmosContentReportRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { ApplicationResult } from '../../_shared/types';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import { SubmitContentReportBody, SubmitContentReportResultDto } from './dtos';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEB_PROTOCOLS = new Set(['http:', 'https:']);

export const CONTENT_URL_ERROR = 'contentUrl must be an http(s) URL';

/**
 * This route is public (no sign-in) and the platform console renders the stored value
 * as a link an operator clicks, so the submitter must not be able to choose the scheme.
 * An allow-list, not a blocklist: `new URL` rejects relative and protocol-relative input
 * ('/x', '//evil'), and anything left that is not http(s) — javascript:, data:, blob:,
 * file: — is refused. Today only React 19 and Chrome's URL policy stop those payloads
 * from executing; that is the frontend's accident, not a guarantee this API can rely on.
 */
export function isHttpUrl(value: string): boolean {
  try {
    return WEB_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

type OptionalText = { ok: true; value: string | undefined } | { ok: false; error: string };

/** An optional text field: absent or blank → undefined; otherwise trimmed and length-checked. */
function readOptionalText(value: unknown, field: string, maxLength: number): OptionalText {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (typeof value !== 'string') return { ok: false, error: `${field} must be a string` };
  const trimmed = value.trim();
  if (trimmed === '') return { ok: true, value: undefined };
  if (trimmed.length > maxLength) {
    return { ok: false, error: `${field} must be at most ${maxLength} characters` };
  }
  return { ok: true, value: trimmed };
}

/**
 * Public, no sign-in: anyone may report illegal content on a storefront (notice-and-action,
 * SPECS §15). Anonymous reports are accepted. The returned reportId is the receipt.
 */
export async function executeSubmitContentReport(
  shopId: string,
  body: SubmitContentReportBody,
): Promise<ApplicationResult<SubmitContentReportResultDto>> {
  if (!shopId || typeof shopId !== 'string' || shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required and must be a non-empty string' };
  }
  if (!isContentReportCategory(body?.category)) {
    return { ok: false, code: 'INVALID_INPUT', error: 'category must be one of the supported content-report categories' };
  }
  if (typeof body.reason !== 'string' || body.reason.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'reason is required and must be a non-empty string' };
  }
  const reason = body.reason.trim();
  if (reason.length > CONTENT_REPORT_REASON_MAX_LENGTH) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: `reason must be at most ${CONTENT_REPORT_REASON_MAX_LENGTH} characters`,
    };
  }

  const contentUrl = readOptionalText(body.contentUrl, 'contentUrl', CONTENT_REPORT_URL_MAX_LENGTH);
  if (!contentUrl.ok) return { ok: false, code: 'INVALID_INPUT', error: contentUrl.error };
  // Blank is still accepted (it never reaches the console as a link); a non-blank value must be web.
  if (contentUrl.value !== undefined && !isHttpUrl(contentUrl.value)) {
    return { ok: false, code: 'INVALID_INPUT', error: CONTENT_URL_ERROR };
  }
  const reporterName = readOptionalText(body.reporterName, 'reporterName', CONTENT_REPORTER_NAME_MAX_LENGTH);
  if (!reporterName.ok) return { ok: false, code: 'INVALID_INPUT', error: reporterName.error };
  const reporterEmail = readOptionalText(body.reporterEmail, 'reporterEmail', CONTENT_REPORTER_EMAIL_MAX_LENGTH);
  if (!reporterEmail.ok) return { ok: false, code: 'INVALID_INPUT', error: reporterEmail.error };
  if (reporterEmail.value !== undefined && !EMAIL_PATTERN.test(reporterEmail.value)) {
    return { ok: false, code: 'INVALID_INPUT', error: 'reporterEmail must be a valid email address' };
  }

  try {
    const shop = await findShopById(shopId.trim());
    if (!shop || shop.isDeleted) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const report: ContentReport = {
      id: crypto.randomUUID(),
      shopId: shop.id,
      shopSlug: shop.slug,
      shopName: shop.name,
      category: body.category,
      reason,
      ...(contentUrl.value !== undefined && { contentUrl: contentUrl.value }),
      ...(reporterName.value !== undefined && { reporterName: reporterName.value }),
      ...(reporterEmail.value !== undefined && { reporterEmail: reporterEmail.value }),
      status: 'received',
      receivedAt: new Date().toISOString(),
    };

    const created = await createContentReport(report);
    return {
      ok: true,
      data: { reportId: created.id, status: 'received', receivedAt: created.receivedAt },
    };
  } catch (error) {
    logServiceFailure('submitContentReport', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to submit content report' };
  }
}
