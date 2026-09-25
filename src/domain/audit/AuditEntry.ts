export interface AuditChange {
  field: string;
  from: unknown;
  to: unknown;
}

export type AuditActorType = 'owner' | 'staff' | 'superadmin' | 'system';

export interface AuditEntry {
  id: string;
  shopId: string; // 'platform' for platform-level entries
  timestamp: string;

  actorType: AuditActorType;
  actorId: string;

  action: string;
  entityType: string;
  entityId: string;
  entityName: string;

  changes?: AuditChange[];
}

export type AuditInput = Omit<AuditEntry, 'id' | 'timestamp'>;
