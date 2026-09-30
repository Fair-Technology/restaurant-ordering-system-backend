import { describe, it, expect } from 'vitest';
import { MA_PASTA_MENU, mapPrintedCodes, resolveDishAllergensAndAdditives } from '../../scripts/menus/mapasta';
import { DE_REFERENCE_LISTS } from '../../src/domain/reference/ReferenceLists';

describe('MA_PASTA_MENU', () => {
  it('has 45 dishes in 5 categories', () => {
    expect(MA_PASTA_MENU.map((c) => [c.name, c.dishes.length])).toEqual([
      ['Pasta', 21],
      ['Lasagne', 7],
      ['Salat', 2],
      ['Getränke', 13],
      ['Dessert', 2],
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

  it('every dish ends up declared with ids that exist in the DE lists', () => {
    const allergenIds = new Set(DE_REFERENCE_LISTS.allergens.map((a) => a.id));
    const additiveIds = new Set(DE_REFERENCE_LISTS.additives.map((a) => a.id));
    for (const category of MA_PASTA_MENU) {
      for (const dish of category.dishes) {
        const resolved = resolveDishAllergensAndAdditives(dish);
        expect(Array.isArray(resolved.allergenIds)).toBe(true);
        expect(Array.isArray(resolved.additiveIds)).toBe(true);
        for (const id of resolved.allergenIds) expect(allergenIds.has(id)).toBe(true);
        for (const id of resolved.additiveIds) expect(additiveIds.has(id)).toBe(true);
      }
    }
  });

  it('every pasta and lasagne dish declares gluten', () => {
    for (const categoryName of ['Pasta', 'Lasagne']) {
      const category = MA_PASTA_MENU.find((c) => c.name === categoryName)!;
      for (const dish of category.dishes) {
        expect(resolveDishAllergensAndAdditives(dish).allergenIds).toContain('gluten');
      }
    }
  });

  it('corrects the three dishes flagged as missing marks', () => {
    const pasta = MA_PASTA_MENU.find((c) => c.name === 'Pasta')!;
    const carbonara = pasta.dishes.find((d) => d.name === 'Carbonara')!;
    expect(resolveDishAllergensAndAdditives(carbonara).allergenIds).toEqual(
      expect.arrayContaining(['gluten', 'eggs', 'milk']),
    );

    const mare = pasta.dishes.find((d) => d.name === 'Mare')!;
    expect(resolveDishAllergensAndAdditives(mare).allergenIds).toContain('molluscs');
  });

  it('gives the dummy drinks and dessert plausible declarations', () => {
    const drinks = MA_PASTA_MENU.find((c) => c.name === 'Getränke')!;
    expect(drinks.taxClassId).toBe('beverage');
    const cola = drinks.dishes.find((d) => d.name === 'Coca-Cola')!;
    expect(resolveDishAllergensAndAdditives(cola).additiveIds).toEqual(['caffeine']);

    const desserts = MA_PASTA_MENU.find((c) => c.name === 'Dessert')!;
    expect(desserts.taxClassId).toBe('food');
    const tiramisu = desserts.dishes.find((d) => d.name === 'Tiramisu')!;
    expect(resolveDishAllergensAndAdditives(tiramisu).allergenIds).toEqual(
      expect.arrayContaining(['eggs', 'milk', 'gluten']),
    );
  });
});
