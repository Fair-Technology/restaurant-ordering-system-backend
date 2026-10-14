import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../../src/infrastructure/cosmos/cosmosClient', () => ({
  shopContainer: { items: { query: (spec: unknown) => query(spec) } },
}));

import {
  findOwnedShopIds,
  findShopsByMemberId,
  findShopBySlug,
  findAllShops,
  findAllShopsIncludingDeleted,
} from '../../src/infrastructure/cosmos/shop/CosmosShopRepository';

describe('deleted shops in shop queries', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockReturnValue({ fetchAll: async () => ({ resources: [] }) });
  });

  it.each([
    ['getMyShops list', () => findShopsByMemberId('u1')],
    ['per-user shop limit count', () => findOwnedShopIds('u1')],
    ['slug lookup', () => findShopBySlug('x')],
    ['background findAllShops', () => findAllShops()],
  ])('%s excludes deleted shops', async (_name, run) => {
    await run();
    expect(query.mock.calls[0][0].query).toContain('c.isDeleted = false');
  });

  it('superadmin listing includes deleted shops', async () => {
    await findAllShopsIncludingDeleted();
    expect(query.mock.calls[0][0].query).not.toContain('isDeleted');
  });

  it.each([
    ['findAllShops', () => findAllShops()],
    ['findAllShopsIncludingDeleted', () => findAllShopsIncludingDeleted()],
  ])('%s has no row cap', async (_name, run) => {
    await run();
    expect(query.mock.calls[0][0].query).not.toMatch(/\bTOP\b/i);
    expect(query.mock.calls[0][0].query).toContain('ORDER BY c.createdAt DESC');
  });
});
