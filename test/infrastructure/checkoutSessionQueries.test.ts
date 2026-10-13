import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../../src/infrastructure/cosmos/cosmosClient', () => ({ checkoutSessionContainer: { items: { query: (spec: unknown) => query(spec) } } }));

import { findCheckoutSessionsWrittenBetween } from '../../src/infrastructure/cosmos/order/CosmosCheckoutSessionRepository';

describe('checkout session queries', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockReturnValue({ fetchAll: async () => ({ resources: [{ id: 's1' }] }) });
  });

  it('asks for checkouts written inside the window', async () => {
    const result = await findCheckoutSessionsWrittenBetween(1791190800, 1791194280);
    expect(query.mock.calls[0][0]).toEqual({
      query: 'SELECT * FROM c WHERE c._ts >= @oldest AND c._ts <= @newest',
      parameters: [{ name: '@oldest', value: 1791190800 }, { name: '@newest', value: 1791194280 }],
    });
    expect(result).toEqual([{ id: 's1' }]);
  });
});
