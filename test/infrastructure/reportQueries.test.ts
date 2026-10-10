import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/infrastructure/cosmos/cosmosClient', () => ({
  orderContainer: { items: { query: vi.fn() } },
}));

import { orderContainer } from '../../src/infrastructure/cosmos/cosmosClient';
import { countWaitingOrders, findReportRows, REPORT_ROW_SELECT } from '../../src/infrastructure/cosmos/order/CosmosOrderRepository';

const query = orderContainer.items.query as unknown as ReturnType<typeof vi.fn>;

describe('report queries', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads accepted and refunded orders of one shop and adds their cost', async () => {
    query
      .mockReturnValueOnce({ fetchAll: async () => ({ resources: [{ id: 'a' }], requestCharge: 3.5 }) })
      .mockReturnValueOnce({ fetchAll: async () => ({ resources: [{ id: 'b' }], requestCharge: 2 }) });

    const res = await findReportRows('shop-1', '2026-10-04T00:00:00.000Z', '2026-10-08T00:00:00.000Z');

    expect(res).toEqual({ rows: [{ id: 'a' }, { id: 'b' }], requestCharge: 5.5 });
    const [first, second] = query.mock.calls.map((c) => c[0]);
    expect(first.query.endsWith('WHERE c.shopId = @shopId AND c.acceptedAt >= @from AND c.acceptedAt < @to')).toBe(true);
    expect(
      second.query.endsWith(
        'WHERE c.shopId = @shopId AND EXISTS(SELECT VALUE r FROM r IN c.refunds WHERE r.at >= @from AND r.at < @to)',
      ),
    ).toBe(true);
    const parameters = [
      { name: '@shopId', value: 'shop-1' },
      { name: '@from', value: '2026-10-04T00:00:00.000Z' },
      { name: '@to', value: '2026-10-08T00:00:00.000Z' },
    ];
    expect(first.parameters).toEqual(parameters);
    expect(second.parameters).toEqual(parameters);
  });

  it('never selects diner data or notes', () => {
    expect(REPORT_ROW_SELECT).not.toMatch(/customer|Notes|deliveryAddress|history|AccessToken|SELECT \*/);
  });

  it('selects each line\'s combo so top dishes can group combos', () => {
    expect(REPORT_ROW_SELECT).toContain('i.discountCents, i.combo FROM i IN c.items');
  });

  it('counts waiting orders without the upcoming bookings', async () => {
    query.mockReturnValueOnce({ fetchAll: async () => ({ resources: [2] }) });

    expect(await countWaitingOrders('shop-1')).toBe(2);
    expect(query.mock.calls[0][0].query).toContain(
      "c.state = 'PLACED' AND (NOT IS_DEFINED(c.scheduledFor) OR IS_DEFINED(c.queuedAt))",
    );
  });
});
