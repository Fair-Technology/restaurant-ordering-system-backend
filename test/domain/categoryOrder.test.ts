import { describe, it, expect } from 'vitest';
import { sortByCategoryOrder } from '../../src/domain/product/Product';

const d = (id: string, name: string, categoryOrder?: Record<string, number>) => ({ id, name, categoryOrder });

describe('sortByCategoryOrder', () => {
  it('puts ordered dishes first, ascending by position', () => {
    const out = sortByCategoryOrder([d('a', 'A', { c1: 2 }), d('b', 'B', { c1: 0 }), d('c', 'C', { c1: 1 })], 'c1');
    expect(out.map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('puts unordered dishes after ordered ones, by name', () => {
    const out = sortByCategoryOrder(
      [d('z', 'Zeta'), d('o', 'Omega', { c1: 5 }), d('a', 'Alpha'), d('n', 'NoMap', { other: 0 })],
      'c1',
    );
    expect(out.map((p) => p.id)).toEqual(['o', 'a', 'n', 'z']);
  });

  it('is stable for ties and does not mutate the input', () => {
    const input = [d('x', 'X', { c1: 1 }), d('y', 'Y', { c1: 1 }), d('z', 'Z', { c1: 1 })];
    const copy = [...input];
    expect(sortByCategoryOrder(input, 'c1').map((p) => p.id)).toEqual(['x', 'y', 'z']);
    expect(input).toEqual(copy);
  });

  it('sorts by name when no dish has a categoryOrder at all', () => {
    expect(sortByCategoryOrder([d('b', 'Bravo'), d('a', 'Alpha')], 'c1').map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('keeps independent positions per category', () => {
    const list = [d('a', 'A', { c1: 0, c2: 1 }), d('b', 'B', { c1: 1, c2: 0 })];
    expect(sortByCategoryOrder(list, 'c1').map((p) => p.id)).toEqual(['a', 'b']);
    expect(sortByCategoryOrder(list, 'c2').map((p) => p.id)).toEqual(['b', 'a']);
  });
});
