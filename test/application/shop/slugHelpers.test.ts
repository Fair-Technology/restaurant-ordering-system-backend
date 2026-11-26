import { describe, it, expect } from 'vitest';
import { generateSlugFromName, validateSlugFormat, validateUniqueSlug } from '../../../src/application/shop/createShop/slugHelpers';

describe('validateSlugFormat', () => {
  it.each(['a', 'a1', 'ab-cd', 'a'.repeat(64), '1abc'])('accepts %s', (s) => {
    expect(validateSlugFormat(s)).toBeNull();
  });
  it.each(['', 'Abc', 'a_b', '-abc', 'a'.repeat(65), 'café', '寿司'])('rejects %s', (s) => {
    expect(validateSlugFormat(s)).toBe('Please choose a link using letters, numbers and hyphens');
  });
});

describe('generateSlugFromName', () => {
  it('transliterates umlauts and strips other diacritics', () => {
    expect(generateSlugFromName("Müller's Café")).toBe('mueller-s-cafe');
    expect(generateSlugFromName('Straße')).toBe('strasse');
    expect(generateSlugFromName('Öl Äpfel Über')).toBe('oel-aepfel-ueber');
    expect(generateSlugFromName('Peña Çiçek')).toBe('pena-cicek');
  });
  it('keeps plain names unchanged', () => {
    expect(generateSlugFromName('Burger King Belconnen')).toBe('burger-king-belconnen');
  });
  it('caps the slug at 64 characters without a trailing hyphen', () => {
    expect(generateSlugFromName('a'.repeat(80))).toBe('a'.repeat(64));
    const s = generateSlugFromName(`${'a'.repeat(63)} bbbb`);
    expect(s).toBe('a'.repeat(63));
    expect(validateSlugFormat(s)).toBeNull();
  });
  it('returns empty for non-Latin names', () => {
    expect(generateSlugFromName('寿司屋')).toBe('');
  });
  it('validateUniqueSlug throws a clear error on empty result', async () => {
    await expect(validateUniqueSlug('寿司屋', async () => false)).rejects.toThrow(
      'Could not generate a link from this name; please choose one',
    );
  });
});
