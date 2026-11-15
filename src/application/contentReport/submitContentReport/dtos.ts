import { ContentReportCategory, ContentReportStatus } from '../../../domain/contentReport/ContentReport';

export interface SubmitContentReportBody {
  category: ContentReportCategory;
  reason: string;
  contentUrl?: string;
  reporterName?: string;
  reporterEmail?: string;
}

export interface SubmitContentReportResultDto {
  reportId: string;
  status: ContentReportStatus;
  receivedAt: string;
}
