import { ContentReportStatus } from '../../../domain/contentReport/ContentReport';

export interface ListContentReportsRequestDto {
  status?: ContentReportStatus | '';
  page?: number;
  pageSize?: number;
}
