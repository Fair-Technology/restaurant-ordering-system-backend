/**
 * Notice-and-action: a report of illegal content on a storefront, and the platform's
 * recorded decision on it. See SPECS §15 ("Notice-and-action").
 */
export type ContentReportCategory =
  | 'illegal_goods'
  | 'fraud_or_scam'
  | 'hate_or_harassment'
  | 'copyright_or_trademark'
  | 'personal_data'
  | 'other';

export const CONTENT_REPORT_CATEGORIES: readonly ContentReportCategory[] = [
  'illegal_goods',
  'fraud_or_scam',
  'hate_or_harassment',
  'copyright_or_trademark',
  'personal_data',
  'other',
];

export function isContentReportCategory(value: unknown): value is ContentReportCategory {
  return typeof value === 'string' && (CONTENT_REPORT_CATEGORIES as readonly string[]).includes(value);
}

export type ContentReportStatus = 'received' | 'actioned' | 'dismissed';

export interface ContentReportDecision {
  decision: 'actioned' | 'dismissed';
  reason: string; // why the platform decided that
  decidedBy: string; // platform operator id (Entra oid)
  decidedAt: string; // ISO
}

export interface ContentReport {
  id: string; // UUID; Cosmos item id and partition key
  shopId: string;
  shopSlug: string; // captured at receipt, so the console can name the storefront later
  shopName: string; // captured at receipt
  category: ContentReportCategory;
  reason: string; // the reporter's own words — what and why it is illegal
  contentUrl?: string; // optional: which page/listing on the storefront
  reporterName?: string; // optional; anonymous reports are allowed
  reporterEmail?: string; // optional
  status: ContentReportStatus;
  receivedAt: string; // ISO
  decision?: ContentReportDecision;
}

export const CONTENT_REPORT_REASON_MAX_LENGTH = 4000;
export const CONTENT_REPORT_URL_MAX_LENGTH = 500;
export const CONTENT_REPORT_DECISION_REASON_MAX_LENGTH = 2000;
export const CONTENT_REPORTER_NAME_MAX_LENGTH = 200;
export const CONTENT_REPORTER_EMAIL_MAX_LENGTH = 254;
