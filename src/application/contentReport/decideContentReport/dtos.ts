export interface DecideContentReportBody {
  decision: 'actioned' | 'dismissed';
  reason: string;
}
