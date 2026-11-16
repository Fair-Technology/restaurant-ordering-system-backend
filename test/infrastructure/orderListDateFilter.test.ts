import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/infrastructure/cosmos/cosmosClient', () => ({
  orderContainer: { items: { query: vi.fn() } },
}));

import { orderContainer } from '../../src/infrastructure/cosmos/cosmosClient';
import { countOrdersByShopId, findOrdersByShopIdPaginated } from '../../src/infrastructure/cosmos/order/CosmosOrderRepository';

const query = orderContainer.items.query as unknown as ReturnType<typeof vi.fn>;
const FROM = '2026-11-16T00:00:00.000Z';
const TO = '2026-11-17T00:00:00.000Z';
const shop = { name: '@shopId', value: 'shop-1' };

const cases = [
  ['no bounds', undefined, undefined, 'c.shopId = @shopId', [shop]],
  ['from only', FROM, undefined, 'c.shopId = @shopId AND c.createdAt >= @from', [shop, { name: '@from', value: FROM }]],
  ['to only', undefined, TO, 'c.shopId = @shopId AND c.createdAt < @to', [shop, { name: '@to', value: TO }]],
  [
    'both',
    FROM,
    TO,
    'c.shopId = @shopId AND c.createdAt >= @from AND c.createdAt < @to',
    [shop, { name: '@from', value: FROM }, { name: '@to', value: TO }],
  ],
] as const;

describe('order list date filter queries', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(cases)('page query, %s', async (_n, from, to, where, parameters) => {
    query.mockReturnValueOnce({ fetchAll: async () => ({ resources: [{ id: 'a' }] }) });
    const res = await findOrdersByShopIdPaginated('shop-1', 2, 10, from, to);
    expect(res).toEqual([{ id: 'a' }]);
    expect(query).toHaveBeenCalledWith({
      query: `SELECT * FROM c WHERE ${where} ORDER BY c.createdAt DESC OFFSET 10 LIMIT 10`,
      parameters,
    });
  });

  it.each(cases)('count query, %s', async (_n, from, to, where, parameters) => {
    query.mockReturnValueOnce({ fetchAll: async () => ({ resources: [7] }) });
    expect(await countOrdersByShopId('shop-1', from, to)).toBe(7);
    expect(query).toHaveBeenCalledWith({ query: `SELECT VALUE COUNT(1) FROM c WHERE ${where}`, parameters });
  });

  it('count returns 0 when there is no result row', async () => {
    query.mockReturnValueOnce({ fetchAll: async () => ({ resources: [] }) });
    expect(await countOrdersByShopId('shop-1', FROM, TO)).toBe(0);
  });
});
