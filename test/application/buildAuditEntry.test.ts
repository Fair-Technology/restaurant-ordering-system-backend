import { describe, it, expect } from 'vitest';
import { buildAuditEntry, resolveActorLabels, resolveStaffTargetNames } from '../../src/application/_shared/buildAuditEntry';
import { AuditEntry, AuditInput } from '../../src/domain/audit/AuditEntry';

describe('buildAuditEntry', () => {
  it('builds a permanent entry', () => {
    const input: AuditInput = {
      shopId: 's1',
      actorType: 'staff',
      actorId: 'st-1',
      action: 'product.update',
      entityType: 'product',
      entityId: 'p1',
      entityName: 'Margherita',
    };
    const now = new Date('2026-09-25T10:00:00Z');

    expect(buildAuditEntry(input, now, 'a-1')).toEqual({
      id: 'a-1',
      timestamp: '2026-09-25T10:00:00.000Z',
      ...input,
    });
  });

  it('drops personal and expiring fields', () => {
    const input = {
      shopId: 's1',
      actorType: 'owner',
      actorId: 'u1',
      action: 'shop.update',
      entityType: 'shop',
      entityId: 's1',
      entityName: 'Pizzeria Kreuzberg',
      actorEmail: 'x@y.de',
      ipAddress: '1.2.3.4',
      ttl: 90,
    } as unknown as AuditInput;

    const result = buildAuditEntry(input, new Date('2026-09-25T10:00:00Z'), 'a-2');

    for (const field of ['ttl', 'actorEmail', 'actorName', 'ipAddress', 'userAgent']) {
      expect(result).not.toHaveProperty(field);
    }
  });
});

describe('resolveActorLabels', () => {
  it('labels actors', () => {
    const entries = [
      { actorType: 'owner' as const, actorId: 'u1' },
      { actorType: 'staff' as const, actorId: 'st-9' },
      { actorType: 'superadmin' as const, actorId: 'u2' },
      { actorType: 'system' as const, actorId: 'system' },
    ];
    const lookups = {
      owners: new Map([['u1', 'Maria Rossi']]),
      staff: new Map<string, string | null>(),
    };

    expect(resolveActorLabels(entries, lookups)).toEqual({
      'owner:u1': 'Maria Rossi',
      'staff:st-9': 'Deleted staff account',
      'superadmin:u2': 'Platform',
      'system:system': 'System',
    });
  });
});

describe('resolveStaffTargetNames', () => {
  const entry = (entityType: AuditEntry['entityType'], entityId: string, entityName: string): AuditEntry => ({
    id: `a-${entityId}`,
    shopId: 's1',
    timestamp: '2026-11-15T10:00:00.000Z',
    actorType: 'owner',
    actorId: 'u1',
    action: `${entityType}.update`,
    entityType,
    entityId,
    entityName,
  }) as AuditEntry;

  // The map is built by the reader as: acc && !acc.isDeleted ? (acc.displayName ?? acc.username) : null
  const label = (acc: { displayName: string | null; username: string }) => acc.displayName ?? acc.username;

  it('uses the display name of a staff target', () => {
    const entries = [entry('staff', 'st-1', 'st-1')];
    resolveStaffTargetNames(entries, new Map([['st-1', label({ displayName: 'Anna K.', username: 'anna' })]]));
    expect(entries[0].entityName).toBe('Anna K.');
  });

  it('falls back to the username when displayName is null', () => {
    const entries = [entry('staff', 'st-2', 'st-2')];
    resolveStaffTargetNames(entries, new Map([['st-2', label({ displayName: null, username: 'bob' })]]));
    expect(entries[0].entityName).toBe('bob');
  });

  it('labels a deleted or unknown staff target', () => {
    const entries = [entry('staff', 'st-3', 'st-3'), entry('staff', 'st-4', 'st-4')];
    resolveStaffTargetNames(entries, new Map<string, string | null>([['st-4', null]]));
    expect(entries.map((e) => e.entityName)).toEqual(['Deleted staff account', 'Deleted staff account']);
  });

  it('leaves non-staff entities untouched', () => {
    const entries = [entry('product', 'p1', 'Margherita')];
    resolveStaffTargetNames(entries, new Map([['p1', 'Should not be used']]));
    expect(entries[0].entityName).toBe('Margherita');
  });

  it('does not change entityId', () => {
    const entries = [entry('staff', 'st-1', 'st-1')];
    resolveStaffTargetNames(entries, new Map([['st-1', 'Anna K.']]));
    expect(entries[0].entityId).toBe('st-1');
  });
});
