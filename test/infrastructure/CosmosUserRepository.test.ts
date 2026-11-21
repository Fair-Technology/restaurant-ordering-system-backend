import { beforeEach, describe, expect, it, vi } from 'vitest';

const { read, upsert } = vi.hoisted(() => ({ read: vi.fn(), upsert: vi.fn() }));
vi.mock('../../src/infrastructure/cosmos/cosmosClient', () => ({
  usersContainer: { item: () => ({ read }), items: { upsert } },
}));

import { upsertUser } from '../../src/infrastructure/cosmos/user/CosmosUserRepository';

describe('upsertUser', () => {
  beforeEach(() => {
    read.mockReset();
    upsert.mockReset();
    upsert.mockResolvedValue({});
  });

  it('does not erase maxShops or language already stored', async () => {
    read.mockResolvedValue({
      resource: {
        id: 'u1', email: 'a@x.de', name: 'A', maxShops: 3, language: 'de',
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
      },
    });
    const res = await upsertUser({
      id: 'u1', email: 'a@x.de', name: 'A', language: undefined,
      createdAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z',
    });
    expect(res.maxShops).toBe(3);
    expect(res.language).toBe('de');
    expect(res.updatedAt).toBe('2026-05-01T00:00:00.000Z');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ maxShops: 3, language: 'de' }));
  });

  it('always keeps createdAt from the existing document', async () => {
    read.mockResolvedValue({
      resource: { id: 'u1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' },
    });
    const res = await upsertUser({ id: 'u1', createdAt: '2026-09-09T00:00:00.000Z', updatedAt: '2026-09-09T00:00:00.000Z' });
    expect(res.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('a first upsert writes exactly the incoming fields', async () => {
    read.mockRejectedValue({ code: 404 });
    const incoming = {
      id: 'u2', email: 'b@x.de', name: 'B',
      createdAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z',
    };
    await upsertUser(incoming);
    expect(upsert).toHaveBeenCalledWith(incoming);
  });
});
