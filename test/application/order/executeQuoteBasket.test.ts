import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({ findProductById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({
  findCategoriesByShopId: vi.fn(async () => (await import('../../fixtures/orders')).CATEGORIES),
}));
vi.mock('../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository', async () => ({
  getReferenceLists: vi.fn(async () => (await import('../../../src/domain/reference/ReferenceLists')).DE_REFERENCE_LISTS),
}));

import { executeQuoteBasket } from '../../../src/application/order/quoteBasket/executeQuoteBasket';
import { findProductById } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { CARD_SHOP, NOW_CLOSED, NOW_OPEN, P_COLA, P_PASTA } from '../../fixtures/orders';

const request = {
  shopId: 'shop-1',
  items: [
    { productId: 'p1', quantity: 1 },
    { productId: 'p2', quantity: 1 },
  ],
};

describe('executeQuoteBasket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    (findProductById as any).mockImplementation(async (id: string) => (id === 'p1' ? P_PASTA : id === 'p2' ? P_COLA : null));
  });

  it("quotes a card shop's basket", async () => {
    const res = await executeQuoteBasket(request, { now: NOW_OPEN });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({
      paymentMethods: ['card'],
      addressRequired: false,
      openNow: true,
      subtotalCents: 1400,
      taxCents: 125,
      prepMinutes: 20,
      belowMinimum: false,
    });
    expect(res.data.lines.map((l) => l.status)).toEqual(['ok', 'ok']);
  });

  it('offers nothing before Stripe is ready', async () => {
    (findShopById as any).mockResolvedValue({ ...CARD_SHOP, stripe: undefined });
    const res = await executeQuoteBasket(request, { now: NOW_OPEN });
    expect(res.ok && res.data.paymentMethods).toEqual([]);
  });

  it('says an address is needed above €250', async () => {
    const res = await executeQuoteBasket({ shopId: 'shop-1', items: [{ productId: 'p1', quantity: 24 }] }, { now: NOW_OPEN });
    expect(res.ok && res.data.addressRequired).toBe(true);
  });

  it('reports closed', async () => {
    const res = await executeQuoteBasket(request, { now: NOW_CLOSED });
    expect(res.ok && res.data.openNow).toBe(false);
  });

  it('refuses a paused shop', async () => {
    (findShopById as any).mockResolvedValue({ ...CARD_SHOP, isPaused: true });
    const res = await executeQuoteBasket(request, { now: NOW_OPEN });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'This shop is not currently accepting orders' });
  });
});
