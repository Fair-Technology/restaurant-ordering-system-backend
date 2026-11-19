import { describe, it, expect } from 'vitest';
import { isValidProductName, isValidProductDescription } from '../../src/domain/product/naming';

describe('isValidProductName', () => {
  it('accepts a non-empty string', () => {
    expect(isValidProductName('Calzone')).toBe(true);
  });

  it.each(['', '   ', 123, null, undefined])('rejects %s', (value) => {
    expect(isValidProductName(value)).toBe(false);
  });
});

describe('isValidProductDescription', () => {
  it.each(['Folded', '  '])('accepts %j', (value) => {
    expect(isValidProductDescription(value)).toBe(true);
  });

  it.each(['', 123, null])('rejects %s', (value) => {
    expect(isValidProductDescription(value)).toBe(false);
  });
});
