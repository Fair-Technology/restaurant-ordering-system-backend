import { AuditEntry, AuditInput } from '../../domain/audit/AuditEntry';

export function buildAuditEntry(input: AuditInput, now: Date, id: string): AuditEntry {
  return {
    id,
    shopId: input.shopId,
    timestamp: now.toISOString(),
    actorType: input.actorType,
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    entityName: input.entityName,
    ...(input.changes ? { changes: input.changes } : {}), // explicit whitelist: smuggled fields never persist
  };
}

export function resolveActorLabels(
  entries: Array<Pick<AuditEntry, 'actorType' | 'actorId'>>,
  lookups: { owners: Map<string, string | null>; staff: Map<string, string | null> },
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of entries) {
    const key = `${e.actorType}:${e.actorId}`;
    if (key in out) continue;
    out[key] =
      e.actorType === 'owner'
        ? (lookups.owners.get(e.actorId) ?? 'Owner')
        : e.actorType === 'staff'
          ? (lookups.staff.get(e.actorId) ?? 'Deleted staff account')
          : e.actorType === 'superadmin'
            ? 'Platform'
            : 'System';
  }
  return out;
}
