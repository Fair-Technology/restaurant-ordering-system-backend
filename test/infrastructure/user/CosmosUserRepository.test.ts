import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, any>();

vi.mock('../../../src/infrastructure/cosmos/cosmosClient', () => ({
  usersContainer: {
    item: (id: string, _pk: string) => ({
      read: async () => ({ resource: store.get(id) }),
    }),
    items: {
      upsert: async (doc: any) => {
        store.set(doc.id, doc);
        return { resource: doc };
      },
    },
  },
}));

import {
  upsertUser,
  patchUserLimits,
} from '../../../src/infrastructure/cosmos/user/CosmosUserRepository';

describe('upsertUser merge preserves operator-set maxShops', () => {
  beforeEach(() => store.clear());

  it('does not wipe maxShops set by patchUserLimits on a later lazy upsert', async () => {
    const now = new Date().toISOString();
    await upsertUser({ id: 'owner-1', email: 'a@x.com', name: 'A', createdAt: now, updatedAt: now });

    await patchUserLimits('owner-1', 10);
    expect(store.get('owner-1').maxShops).toBe(10);

    // Same shape as executeGetMe.ts / auditHelpers.ts: no maxShops key at all.
    const later = new Date(Date.now() + 60_000).toISOString();
    const result = await upsertUser({ id: 'owner-1', email: 'a@x.com', name: 'A', createdAt: later, updatedAt: later });

    expect(result.maxShops).toBe(10);
    expect(store.get('owner-1').maxShops).toBe(10);
    expect(result.createdAt).toBe(now);
    expect(result.updatedAt).toBe(later);
  });

  it('still updates email/name on a lazy upsert after a limit was set', async () => {
    const now = new Date().toISOString();
    await upsertUser({ id: 'owner-2', email: 'old@x.com', name: 'Old', createdAt: now, updatedAt: now });
    await patchUserLimits('owner-2', -1);

    const result = await upsertUser({ id: 'owner-2', email: 'new@x.com', name: 'New', createdAt: now, updatedAt: now });
    expect(result.email).toBe('new@x.com');
    expect(result.name).toBe('New');
    expect(result.maxShops).toBe(-1);
  });
});
