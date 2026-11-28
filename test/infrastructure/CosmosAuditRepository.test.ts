import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../src/infrastructure/cosmos/cosmosClient', () => ({
  auditLogsContainer: { items: { query, create: vi.fn() } },
}));

import { findAuditEntriesByShop, findDistinctAuditActors } from '../../src/infrastructure/cosmos/audit/CosmosAuditRepository';

beforeEach(() => {
  query.mockReset();
  query.mockReturnValue({ fetchAll: async () => ({ resources: [] }) });
});

describe('findAuditEntriesByShop query', () => {
  it('no filters: original SQL text', async () => {
    await findAuditEntriesByShop('s1', 1, 20);
    expect(query.mock.calls[0][0].query).toBe('SELECT VALUE COUNT(1) FROM c WHERE c.shopId = @shopId');
    expect(query.mock.calls[1][0].query).toBe(
      'SELECT * FROM c WHERE c.shopId = @shopId ORDER BY c.timestamp DESC OFFSET @offset LIMIT @pageSize',
    );
  });

  it('filters apply to both COUNT and SELECT', async () => {
    await findAuditEntriesByShop('s1', 2, 10, { actions: ['a', 'b'], actorType: 'staff', actorId: 'x' });
    for (const [spec] of query.mock.calls) {
      expect(spec.query).toContain('ARRAY_CONTAINS(@actions, c.action)');
      expect(spec.query).toContain('c.actorType = @actorType');
      expect(spec.query).toContain('c.actorId = @actorId');
      expect(spec.parameters).toContainEqual({ name: '@actions', value: ['a', 'b'] });
      expect(spec.parameters).toContainEqual({ name: '@actorType', value: 'staff' });
      expect(spec.parameters).toContainEqual({ name: '@actorId', value: 'x' });
    }
  });

  it('actorType alone omits actorId and actions', async () => {
    await findAuditEntriesByShop('s1', 1, 20, { actorType: 'system' });
    const q = query.mock.calls[0][0].query;
    expect(q).toContain('c.actorType = @actorType');
    expect(q).not.toContain('actorId');
    expect(q).not.toContain('ARRAY_CONTAINS');
  });
});

describe('findAuditEntriesByShop Cosmos metadata', () => {
  it('strips _rid/_self/_etag/_attachments/_ts from every entry', async () => {
    const meta = { _rid: 'r', _self: 's', _etag: 'e', _attachments: 'a/', _ts: 1 };
    query
      .mockReturnValueOnce({ fetchAll: async () => ({ resources: [2] }) })
      .mockReturnValueOnce({ fetchAll: async () => ({ resources: [{ id: 'a1', ...meta }, { id: 'a2', ...meta }] }) });
    const { entries, total } = await findAuditEntriesByShop('s1', 1, 20);
    expect(total).toBe(2);
    expect(entries.map((e) => e.id)).toEqual(['a1', 'a2']);
    for (const e of entries) for (const k of Object.keys(meta)) expect(e).not.toHaveProperty(k);
  });
});

describe('findDistinctAuditActors', () => {
  it('uses a DISTINCT projection', async () => {
    await findDistinctAuditActors('s1');
    expect(query.mock.calls[0][0].query).toContain('SELECT DISTINCT VALUE {actorType: c.actorType, actorId: c.actorId}');
  });
});
