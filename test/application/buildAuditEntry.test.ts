import { describe, it, expect } from 'vitest';
import { buildAuditEntry, resolveActorLabels } from '../../src/application/_shared/buildAuditEntry';
import { AuditInput } from '../../src/domain/audit/AuditEntry';

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
