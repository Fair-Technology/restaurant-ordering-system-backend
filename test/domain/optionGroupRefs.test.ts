import { describe, expect, it } from 'vitest';
import { resolveProductOptionGroups } from '../../src/domain/product/optionGroupRefs';
import type { ShopOptionGroup } from '../../src/domain/optionGroup/ShopOptionGroup';
import { P_PASTA } from '../fixtures/orders';

const base = { shopId: 'shop-1', isDeleted: false, createdAt: 'x', updatedAt: 'x' };
const drink: ShopOptionGroup = {
  ...base,
  id: 'g-drink',
  kind: 'variant',
  name: 'Drink',
  nameTranslations: { en: 'Drink' },
  minSelectable: 1,
  maxSelectable: 1,
  options: [
    { id: 'coke', name: 'Coke', priceDelta: 250, isAvailable: false, allergenIds: [], additiveIds: ['caffeine'] },
    { id: 'water', name: 'Water', priceDelta: 0, isAvailable: true },
  ],
};
const sauces: ShopOptionGroup = {
  ...base,
  id: 'g-sauce',
  kind: 'addon',
  name: 'Sauces',
  minSelectable: 0,
  maxSelectable: 2,
  options: [{ id: 'mayo', name: 'Mayo', priceDelta: 50, isAvailable: true }],
};
const gone: ShopOptionGroup = { ...sauces, id: 'g-gone', isDeleted: true };
const library = new Map([drink, sauces, gone].map((g) => [g.id, g]));

describe('resolveProductOptionGroups', () => {
  it('returns the product unchanged without refs', () => {
    expect(resolveProductOptionGroups(P_PASTA, library)).toBe(P_PASTA);
    const empty = { ...P_PASTA, optionGroupRefs: [] };
    expect(resolveProductOptionGroups(empty, library)).toBe(empty);
  });

  it('appends variant refs to variantGroups and addon refs to addonGroups, after the inline ones', () => {
    const p = { ...P_PASTA, optionGroupRefs: ['g-drink', 'g-sauce'] };
    const r = resolveProductOptionGroups(p, library);
    expect(r.variantGroups?.map((g) => g.id)).toEqual(['vg', 'g-drink']);
    expect(r.addonGroups?.map((g) => g.id)).toEqual(['ag', 'g-sauce']);
    expect(r.variantGroups?.[1]).toEqual({
      id: 'g-drink',
      name: 'Drink',
      nameTranslations: { en: 'Drink' },
      options: [
        { id: 'coke', name: 'Coke', nameTranslations: undefined, priceDelta: 250, isAvailable: false, allergenIds: [], additiveIds: ['caffeine'] },
        { id: 'water', name: 'Water', nameTranslations: undefined, priceDelta: 0, isAvailable: true, allergenIds: undefined, additiveIds: undefined },
      ],
    });
    expect(r.addonGroups?.[1]).toMatchObject({ minSelectable: 0, maxSelectable: 2 });
    expect(r.name).toBe(P_PASTA.name);
  });

  it('keeps addon groups in the dish\'s own optionGroupRefs order, not alphabetical or library order', () => {
    const mk = (id: string): ShopOptionGroup => ({ ...sauces, id, name: id });
    const lib = new Map([mk('g-aa'), mk('g-mm'), mk('g-zz')].map((g) => [g.id, g]));
    const refs = ['g-zz', 'g-aa', 'g-mm'];
    const r = resolveProductOptionGroups({ ...P_PASTA, optionGroupRefs: refs }, lib);
    expect(r.addonGroups?.map((g) => g.id)).toEqual(['ag', ...refs]);
  });

  it('skips unknown and deleted refs, and dedupes', () => {
    const p = { ...P_PASTA, optionGroupRefs: ['nope', 'g-gone', 'g-sauce', 'g-sauce'] };
    const r = resolveProductOptionGroups(p, library);
    expect(r.variantGroups?.map((g) => g.id)).toEqual(['vg']);
    expect(r.addonGroups?.map((g) => g.id)).toEqual(['ag', 'g-sauce']);
  });

  it('does not mutate the input', () => {
    const p = { ...P_PASTA, optionGroupRefs: ['g-drink'] };
    const snapshot = JSON.parse(JSON.stringify(p));
    const r = resolveProductOptionGroups(p, library);
    expect(r).not.toBe(p);
    expect(JSON.parse(JSON.stringify(p))).toEqual(snapshot);
  });
});
