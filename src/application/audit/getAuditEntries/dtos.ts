import { AuditEntry } from '../../../domain/audit/AuditEntry';

export interface GetAuditEntriesRequestDto {
  shopId: string;
  page?: number;
  pageSize?: number;
  area?: string;
  actor?: string;
}

export interface GetAuditEntriesResultDto {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  actorLabels: Record<string, string>;
  actors: Array<{ key: string; label: string }>;
}
