import { describe, it, expect } from 'vitest';
import { MA_PASTA_MENU, mapPrintedCodes } from '../../scripts/menus/mapasta';
import { DE_REFERENCE_LISTS } from '../../src/domain/reference/ReferenceLists';

describe('MA_PASTA_MENU', () => {
  it('has 30 dishes in 3 categories', () => {
    expect(MA_PASTA_MENU.map((c) => [c.name, c.dishes.length])).toEqual([
      ['Pasta', 21],
      ['Lasagne', 7],
      ['Salat', 2],
    ]);
  });

  it('has prices in whole cents', () => {
    const allDishes = MA_PASTA_MENU.flatMap((c) => c.dishes);
    for (const dish of allDishes) {
      expect(Number.isInteger(dish.price)).toBe(true);
    }
    const mare = allDishes.find((d) => d.name === 'Mare');
    expect(mare?.price).toBe(1650);
  });

  it('maps printed codes to platform ids', () => {
    expect(mapPrintedCodes([1, 2, 6, 7])).toEqual({ allergenIds: ['milk'], additiveIds: ['colouring', 'preservative'] });
    expect(mapPrintedCodes([4, 10])).toEqual({ allergenIds: ['crustaceans', 'sulphites'], additiveIds: ['sulphured'] });
    expect(mapPrintedCodes([6, 9, 11])).toEqual({ allergenIds: ['gluten', 'fish', 'milk'], additiveIds: [] });
  });

  it('maps every dish id to one that exists in the DE lists', () => {
    const allergenIds = new Set(DE_REFERENCE_LISTS.allergens.map((a) => a.id));
    const additiveIds = new Set(DE_REFERENCE_LISTS.additives.map((a) => a.id));
    for (const category of MA_PASTA_MENU) {
      for (const dish of category.dishes) {
        const mapped = mapPrintedCodes(dish.printedCodes);
        for (const id of mapped.allergenIds) expect(allergenIds.has(id)).toBe(true);
        for (const id of mapped.additiveIds) expect(additiveIds.has(id)).toBe(true);
      }
    }
  });
});
