import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopBySlug: vi.fn() }));

import { executeGetShopBySlug } from '../../../src/application/shop/getShopBySlug/executeGetShopBySlug';
import { findShopBySlug } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { CARD_SHOP, DINE_IN_SHOP } from '../../fixtures/orders';

describe('executeGetShopBySlug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers dine-in only when switched on', async () => {
    (findShopBySlug as any).mockResolvedValue(CARD_SHOP);
    const off = await executeGetShopBySlug({ slug: 'mapasta' });
    expect(off.ok && off.data.fulfilment.modes).toEqual(['collection']);

    (findShopBySlug as any).mockResolvedValue(DINE_IN_SHOP);
    const on = await executeGetShopBySlug({ slug: 'mapasta' });
    expect(on.ok && on.data.fulfilment.modes).toEqual(['collection', 'dine_in']);
    expect(on.ok && on.data.fulfilment.prepMinutes.dine_in).toBe(20);
  });
});
