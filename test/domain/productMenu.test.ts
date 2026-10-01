import { describe, it, expect } from 'vitest';
import { isDeclared } from '../../src/domain/product/Product';

describe('isDeclared', () => {
  it('counts empty lists as declared', () => {
    expect(isDeclared({ allergenIds: [], additiveIds: [] })).toBe(true);
  });

  it('treats null as undeclared', () => {
    expect(isDeclared({ allergenIds: null, additiveIds: [] })).toBe(false);
  });

  it('treats missing keys as undeclared', () => {
    expect(isDeclared({})).toBe(false);
  });
});
