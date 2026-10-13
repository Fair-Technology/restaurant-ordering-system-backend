import { describe, expect, it } from 'vitest';
import { cleanText, splitIntoRuns, wrapText } from '../../src/infrastructure/pdf/textRuns';

const L = { covers: (cp: number) => cp < 0x250 };
const C = { covers: (cp: number) => (cp >= 0x3000 && cp <= 0x9fff) || (cp >= 0xac00 && cp <= 0xd7af) };
const len = (s: string) => [...s].length;

describe('splitIntoRuns', () => {
  it('splits a mixed name into one run per font', () => {
    expect(splitIntoRuns('Sushi 寿司 Bar', [L, C])).toEqual([
      { face: L, text: 'Sushi ' },
      { face: C, text: '寿司' },
      { face: L, text: ' Bar' },
    ]);
  });
  it('prints ? in the first font for a character no font has', () => {
    expect(splitIntoRuns('Anna 🍕', [L, C])).toEqual([{ face: L, text: 'Anna ?' }]);
  });
  it('without the CJK font, 寿司 becomes ??', () => {
    expect(splitIntoRuns('寿司', [L])).toEqual([{ face: L, text: '??' }]);
  });
  it('returns no runs for an empty string', () => {
    expect(splitIntoRuns('', [L])).toEqual([]);
  });
});

describe('cleanText', () => {
  it('composes a decomposed Ş', () => {
    expect(cleanText('Şahin')).toBe('Şahin');
  });
  it('turns newlines and tabs into spaces but keeps no-break space', () => {
    expect(cleanText('a\nb\tc d')).toBe('a b c d');
  });
  it('turns control characters into ?', () => {
    expect(cleanText('a\u0007b\u0085c')).toBe('a?b?c');
  });
});

describe('wrapText', () => {
  it('wraps on spaces', () => {
    expect(wrapText('one two three four', 10, len)).toEqual(['one two', 'three four']);
  });
  it('breaks a word longer than the line', () => {
    expect(wrapText('abcdefghijklmnop', 10, len)).toEqual(['abcdefghij', 'klmnop']);
  });
  it('breaks CJK text with no spaces', () => {
    expect(wrapText('寿司寿司寿司寿司寿司寿司', 10, len)).toEqual(['寿司寿司寿司寿司寿司', '寿司']);
  });
  it('returns one empty line for empty text', () => {
    expect(wrapText('', 10, (s) => s.length)).toEqual(['']);
  });
});
