import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({ findProductById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({ findCategoriesByShopId: vi.fn(async () => []) }));
vi.mock('../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository', async () => ({
  getReferenceLists: vi.fn(async () => (await import('../../../src/domain/reference/ReferenceLists')).DE_REFERENCE_LISTS),
}));
vi.mock('../../../src/infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository', () => ({ findShopOptionGroupsByShopId: vi.fn() }));

import { loadPricingContext } from '../../../src/application/order/_shared/loadPricingContext';
import { priceBasket } from '../../../src/application/order/_shared/priceBasket';
import { findProductById } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { findShopOptionGroupsByShopId } from '../../../src/infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository';
import { CARD_SHOP, CATEGORIES, NOW_OPEN, P_COLA } from '../../fixtures/orders';

const dish = { ...P_COLA, variantGroups: [], addonGroups: [], optionGroupRefs: ['g1'] };
const group = {
  id: 'g1', shopId: 'shop-1', kind: 'addon', name: 'Extras', minSelectable: 0, maxSelectable: 2, isDeleted: false,
  createdAt: 'x', updatedAt: 'x',
  options: [
    { id: 'ice', name: 'Ice', priceDelta: 40, isAvailable: true },
    { id: 'lemon', name: 'Lemon', priceDelta: 30, isAvailable: false },
  ],
};

async function quote(optionIds: string[]) {
  const ctx = await loadPricingContext(CARD_SHOP as any, [dish.id]);
  return priceBasket({
    items: [{ productId: dish.id, quantity: 1, selectedAddonOptionIds: optionIds }],
    products: ctx.products,
    categories: CATEGORIES,
    refs: ctx.refs,
    shop: { timezone: 'Europe/Berlin', menuLanguages: ['de' as const], countryCode: 'DE' },
    mode: 'collection',
    now: NOW_OPEN,
    language: 'de',
  });
}

describe('loadPricingContext with library option groups', () => {
  beforeEach(() => {
    (findProductById as any).mockResolvedValue(dish);
    (findShopOptionGroupsByShopId as any).mockResolvedValue([group]);
  });

  it("prices a library option's priceDelta", async () => {
    const r = await quote(['ice']);
    expect(r.lines[0].status).toBe('ok');
    expect(r.items[0].unitPriceCents).toBe(P_COLA.price + 40);
  });

  it('marks an option switched off in the library unavailable', async () => {
    const r = await quote(['lemon']);
    expect(r.lines[0].status).toBe('unavailable');
  });
});
