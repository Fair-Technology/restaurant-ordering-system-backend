import { describe, expect, it } from 'vitest';
import { priceBasket } from '../../../src/application/order/_shared/priceBasket';
import { DE_REFERENCE_LISTS } from '../../../src/domain/reference/ReferenceLists';
import { CATEGORIES, NOW_OPEN, P_COLA, P_PASTA, P_SALAD } from '../../fixtures/orders';
import type { Product } from '../../../src/domain/product/Product';

const SHOP = { timezone: 'Europe/Berlin', menuLanguages: ['de' as const], countryCode: 'DE' };

function price(
  items: Parameters<typeof priceBasket>[0]['items'],
  extra: Partial<Parameters<typeof priceBasket>[0]> = {},
  products: Product[] = [P_PASTA, P_COLA, P_SALAD],
) {
  return priceBasket({
    items,
    products: new Map(products.map((p) => [p.id, p])),
    categories: CATEGORIES,
    refs: DE_REFERENCE_LISTS,
    shop: SHOP,
    mode: 'collection',
    now: NOW_OPEN,
    language: 'de',
    ...extra,
  });
}

describe('priceBasket', () => {
  it('prices a dish with size and extras and taxes it at 7%', () => {
    const r = price([{ productId: 'p1', quantity: 2, selectedVariantOptionId: 'big', selectedAddonOptionIds: ['parm'] }]);
    expect(r.lines[0].status).toBe('ok');
    expect(r.items[0]).toMatchObject({
      unitPriceCents: 1450,
      lineTotalCents: 2900,
      taxRateBasisPoints: 700,
      taxCents: 190,
      selectedVariantOptionName: 'Groß',
      selectedAddonOptionNames: ['Parmesan'],
    });
    expect(r.subtotalCents).toBe(2900);
  });

  it('taxes a drink at 19%', () => {
    const r = price([{ productId: 'p2', quantity: 1 }]);
    expect(r.items[0]).toMatchObject({ taxClassId: 'beverage', taxCents: 56 });
    expect(r.taxBreakdown).toEqual([{ rateBasisPoints: 1900, grossCents: 350, taxCents: 56 }]);
  });

  it('mixed basket breakdown', () => {
    const r = price([
      { productId: 'p1', quantity: 1 },
      { productId: 'p2', quantity: 1 },
    ]);
    expect(r.subtotalCents).toBe(1400);
    expect(r.taxBreakdown).toEqual([
      { rateBasisPoints: 700, grossCents: 1050, taxCents: 69 },
      { rateBasisPoints: 1900, grossCents: 350, taxCents: 56 },
    ]);
  });

  it('flags a changed price', () => {
    const r = price([{ productId: 'p2', quantity: 1, expectedUnitPriceCents: 300 }]);
    expect(r.lines[0]).toMatchObject({ status: 'price_changed', expectedUnitPriceCents: 300 });
    expect(r.lines[0].item?.unitPriceCents).toBe(350);
    expect(r.allOk).toBe(false);
  });

  it('flags a sold-out dish as unavailable', () => {
    const r = price([{ productId: 'p2', quantity: 1 }], {}, [{ ...P_COLA, isAvailable: false }]);
    expect(r.lines[0]).toMatchObject({ status: 'unavailable', item: null, displayName: 'Cola' });
  });

  it('flags an unknown dish', () => {
    const r = price([{ productId: 'nope', quantity: 1 }]);
    expect(r.lines[0]).toMatchObject({ status: 'unavailable', item: null, displayName: null });
  });

  it('flags a sold-out size', () => {
    const r = price([{ productId: 'p1', quantity: 1, selectedVariantOptionId: 'off' }]);
    expect(r.lines[0].status).toBe('unavailable');
  });

  it('enforces an extra group minimum and maximum', () => {
    expect(price([{ productId: 'p3', quantity: 1 }]).lines[0].status).toBe('invalid_options');
    expect(price([{ productId: 'p3', quantity: 1, selectedAddonOptionIds: ['oil', 'yog'] }]).lines[0].status).toBe(
      'invalid_options',
    );
    expect(price([{ productId: 'p3', quantity: 1, selectedAddonOptionIds: ['oil'] }]).lines[0].status).toBe('ok');
  });

  it('localises the display name but keeps the original for the kitchen', () => {
    const r = price([{ productId: 'p1', quantity: 1 }], {
      shop: { ...SHOP, menuLanguages: ['de', 'en'] },
      language: 'en',
    });
    expect(r.lines[0].displayName).toBe('Carbonara (EN)');
    expect(r.items[0].productName).toBe('Carbonara');
  });
});
