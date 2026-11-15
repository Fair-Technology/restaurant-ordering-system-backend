import { describe, expect, it } from 'vitest';
import { isAvailableNow, isSoldOut } from '../../../src/domain/product/Product';
import { priceBasket } from '../../../src/application/order/_shared/priceBasket';
import { buildCatalog } from '../../../src/application/category/getCatalog/buildCatalog';
import { DE_REFERENCE_LISTS } from '../../../src/domain/reference/ReferenceLists';
import type { Product } from '../../../src/domain/product/Product';
import { CATEGORIES, NOW_OPEN, P_COLA, P_PASTA } from '../../fixtures/orders';

// NOW_OPEN is Monday 5 October 2026, 12:00 in Berlin
const SHOP = { timezone: 'Europe/Berlin', menuLanguages: ['de' as const], countryCode: 'DE' };

const soldOutUntil = (iso: string): Product => ({ ...P_PASTA, unavailableUntil: iso });

function price(products: Product[], now: Date = NOW_OPEN, checkTimes?: boolean) {
  return priceBasket({
    items: [{ productId: 'p1', quantity: 1 }],
    products: new Map(products.map((p) => [p.id, p])),
    categories: CATEGORIES,
    refs: DE_REFERENCE_LISTS,
    shop: SHOP,
    mode: 'collection',
    now,
    language: 'de',
    ...(checkTimes === undefined ? {} : { checkTimes }),
  });
}

describe('isSoldOut / isAvailableNow', () => {
  it('nothing set means not sold out', () => {
    expect(isSoldOut({}, NOW_OPEN)).toBe(false);
    expect(isSoldOut({ unavailableUntil: null }, NOW_OPEN)).toBe(false);
  });

  it('a window that ends in the future is sold out; one that has passed is not', () => {
    expect(isSoldOut({ unavailableUntil: '2026-10-05T15:00:00Z' }, NOW_OPEN)).toBe(true);
    expect(isSoldOut({ unavailableUntil: '2026-10-05T09:00:00Z' }, NOW_OPEN)).toBe(false);
  });

  it('the exact end instant is no longer sold out', () => {
    expect(isSoldOut({ unavailableUntil: NOW_OPEN.toISOString() }, NOW_OPEN)).toBe(false);
  });

  it('a malformed value never hides a dish', () => {
    expect(isSoldOut({ unavailableUntil: 'soon' }, NOW_OPEN)).toBe(false);
  });

  it('effective availability = switched on and outside a sold-out window', () => {
    expect(isAvailableNow({ isAvailable: true }, NOW_OPEN)).toBe(true);
    expect(isAvailableNow({ isAvailable: false }, NOW_OPEN)).toBe(false);
    expect(isAvailableNow({ isAvailable: true, unavailableUntil: '2026-10-05T15:00:00Z' }, NOW_OPEN)).toBe(false);
  });
});

describe('ordering a sold-out dish', () => {
  it('is refused as unavailable while the window is open', () => {
    expect(price([soldOutUntil('2026-10-05T15:00:00Z')]).lines[0].status).toBe('unavailable');
  });

  it('is offered again once the window has passed', () => {
    expect(price([soldOutUntil('2026-10-05T09:00:00Z')]).lines[0].status).toBe('ok');
  });

  it('the judgement is made at the moment the order is priced, not at import time', () => {
    const later = new Date('2026-10-05T18:00:00Z');
    expect(price([soldOutUntil('2026-10-05T15:00:00Z')], later).lines[0].status).toBe('ok');
  });
});

describe('catalog marks a sold-out dish instead of hiding it', () => {
  const catalogProduct = (soldOutIso: string | null) => {
    const dto = buildCatalog({
      shop: SHOP,
      categories: CATEGORIES,
      products: [soldOutUntil(soldOutIso as string), P_COLA],
      refs: DE_REFERENCE_LISTS,
      lang: 'de',
      now: NOW_OPEN,
    });
    return dto.categories.flatMap((c) => c.products).find((p) => p.id === 'p1');
  };

  it('keeps the dish listed with soldOut true and the window end', () => {
    expect(catalogProduct('2026-10-05T15:00:00Z')).toMatchObject({
      isAvailable: true,
      soldOut: true,
      unavailableUntil: '2026-10-05T15:00:00Z',
    });
  });

  it('an unsold dish carries soldOut false and a null window', () => {
    const unsold = buildCatalog({
      shop: SHOP,
      categories: CATEGORIES,
      products: [P_PASTA, P_COLA],
      refs: DE_REFERENCE_LISTS,
      lang: 'de',
      now: NOW_OPEN,
    });
    const dish = unsold.categories.flatMap((c) => c.products).find((p) => p.id === 'p1');
    expect(dish).toMatchObject({ soldOut: false, unavailableUntil: null });
  });
});
