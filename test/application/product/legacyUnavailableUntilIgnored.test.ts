import { describe, expect, it } from 'vitest';
import { priceBasket } from '../../../src/application/order/_shared/priceBasket';
import { buildCatalog } from '../../../src/application/category/getCatalog/buildCatalog';
import { DE_REFERENCE_LISTS } from '../../../src/domain/reference/ReferenceLists';
import type { Product } from '../../../src/domain/product/Product';
import { CATEGORIES, NOW_OPEN, P_COLA, P_PASTA } from '../../fixtures/orders';

// A Cosmos document written before the sold-out-until feature was removed still carries the field.
// Nothing reads it any more: isAvailable alone decides.
const SHOP = { timezone: 'Europe/Berlin', menuLanguages: ['de' as const], countryCode: 'DE' };

const legacy = (isAvailable: boolean) =>
  ({ ...P_PASTA, isAvailable, unavailableUntil: '2099-01-01T00:00:00Z' }) as unknown as Product;

function price(product: Product) {
  return priceBasket({
    items: [{ productId: 'p1', quantity: 1 }],
    products: new Map([[product.id, product]]),
    categories: CATEGORIES,
    refs: DE_REFERENCE_LISTS,
    shop: SHOP,
    mode: 'collection',
    now: NOW_OPEN,
    language: 'de',
  });
}

function catalogDish(product: Product) {
  const dto = buildCatalog({
    shop: SHOP,
    categories: CATEGORIES,
    products: [product, P_COLA],
    refs: DE_REFERENCE_LISTS,
    lang: 'de',
    now: NOW_OPEN,
  });
  return dto.categories.flatMap((c) => c.products).find((p) => p.id === 'p1');
}

describe('a stored legacy unavailableUntil is ignored', () => {
  it('an available dish with a far-future unavailableUntil is orderable', () => {
    expect(price(legacy(true)).lines[0].status).toBe('ok');
  });

  it('the catalog lists it as available, with no soldOut / unavailableUntil key', () => {
    const dish = catalogDish(legacy(true));
    expect(dish).toBeDefined();
    expect(dish).toMatchObject({ isAvailable: true });
    expect(dish).not.toHaveProperty('soldOut');
    expect(dish).not.toHaveProperty('unavailableUntil');
  });

  it('isAvailable false still wins: not orderable and not listed', () => {
    expect(price(legacy(false)).lines[0].status).toBe('unavailable');
    expect(catalogDish(legacy(false))).toBeUndefined();
  });
});
