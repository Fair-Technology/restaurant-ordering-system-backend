import { describe, expect, it } from 'vitest';
import { normaliseTableLabel } from '../../src/domain/order/table';

describe('table numbers', () => {
  it('normalises a table number', () => {
    expect(normaliseTableLabel(' 7 ')).toBe('7');
    expect(normaliseTableLabel('Terrasse  3')).toBe('Terrasse 3');
    expect(normaliseTableLabel('Außen-12')).toBe('Außen-12');
    expect(normaliseTableLabel('B1')).toBe('B1');
    expect(normaliseTableLabel('1234567890')).toBe('1234567890');
  });

  it('refuses table numbers that are too long or use other characters', () => {
    for (const bad of ['12345678901', 'Bar 1 Links', '-7', 'Pizza 🍕', '', '   ', 7, undefined, null]) {
      expect(normaliseTableLabel(bad)).toBeNull();
    }
  });
});
