import { AuditActorType, AuditEntry } from '../../../domain/audit/AuditEntry';
import type { SqlParameter } from '@azure/cosmos';
import { auditLogsContainer } from '../cosmosClient';
import { stripCosmosMetaAll } from '../stripCosmosMeta';

export async function createAuditEntry(entry: AuditEntry): Promise<void> {
  await auditLogsContainer.items.create<AuditEntry>(entry);
}

export interface AuditEntryFilters {
  actions?: string[];
  actorType?: AuditActorType;
  actorId?: string;
}

/** WHERE clause + parameters shared by the COUNT and the paged SELECT. No filters = the original clause. */
export function buildAuditWhere(shopId: string, filters?: AuditEntryFilters) {
  const clauses = ['c.shopId = @shopId'];
  const parameters: SqlParameter[] = [{ name: '@shopId', value: shopId }];
  if (filters?.actions) {
    clauses.push('ARRAY_CONTAINS(@actions, c.action)');
    parameters.push({ name: '@actions', value: filters.actions });
  }
  if (filters?.actorType) {
    clauses.push('c.actorType = @actorType');
    parameters.push({ name: '@actorType', value: filters.actorType });
  }
  if (filters?.actorId) {
    clauses.push('c.actorId = @actorId');
    parameters.push({ name: '@actorId', value: filters.actorId });
  }
  return { where: clauses.join(' AND '), parameters };
}

export async function findAuditEntriesByShop(
  shopId: string,
  page: number,
  pageSize: number,
  filters?: AuditEntryFilters,
): Promise<{ entries: AuditEntry[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const { where, parameters } = buildAuditWhere(shopId, filters);

  const countSpec = {
    query: `SELECT VALUE COUNT(1) FROM c WHERE ${where}`,
    parameters,
  };
  const { resources: countResult } = await auditLogsContainer.items
    .query<number>(countSpec)
    .fetchAll();
  const total = countResult[0] ?? 0;

  const querySpec = {
    query: `SELECT * FROM c WHERE ${where} ORDER BY c.timestamp DESC OFFSET @offset LIMIT @pageSize`,
    parameters: [
      ...parameters,
      { name: '@offset', value: offset },
      { name: '@pageSize', value: pageSize },
    ],
  };
  const { resources: entries } = await auditLogsContainer.items
    .query<AuditEntry>(querySpec)
    .fetchAll();

  return { entries: stripCosmosMetaAll(entries ?? []), total };
}

// Single indexed DISTINCT projection drives the "Who" dropdown: far fewer RUs than reading every entry.
export async function findDistinctAuditActors(
  shopId: string,
): Promise<Array<Pick<AuditEntry, 'actorType' | 'actorId'>>> {
  const { resources } = await auditLogsContainer.items
    .query<Pick<AuditEntry, 'actorType' | 'actorId'>>({
      query: 'SELECT DISTINCT VALUE {actorType: c.actorType, actorId: c.actorId} FROM c WHERE c.shopId = @shopId',
      parameters: [{ name: '@shopId', value: shopId }],
    })
    .fetchAll();
  return resources ?? [];
}
