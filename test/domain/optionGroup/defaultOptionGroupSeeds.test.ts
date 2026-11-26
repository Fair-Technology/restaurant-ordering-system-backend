import { describe, it, expect } from 'vitest';
import { buildDefaultOptionGroupSeeds } from '../../../src/domain/optionGroup/defaultOptionGroupSeeds';

describe('buildDefaultOptionGroupSeeds', () => {
  it('en: Size variant and Extras add-on with German translations', () => {
    const [size, extras] = buildDefaultOptionGroupSeeds('en');
    expect(size).toMatchObject({ kind: 'variant', name: 'Size', nameTranslations: { de: 'Größe' }, minSelectable: 1, maxSelectable: 1 });
    expect(size.options.map((o) => o.name)).toEqual(['Small', 'Medium', 'Large']);
    expect(size.options[0].nameTranslations).toEqual({ de: 'Klein' });
    expect(extras).toMatchObject({ kind: 'addon', name: 'Extras', minSelectable: 0, maxSelectable: 3 });
    expect(extras.nameTranslations.de).toBeTruthy();
    expect(extras.options.map((o) => o.name)).toEqual(['Extra cheese', 'Extra sauce', 'Extra portion']);
    extras.options.forEach((o) => expect(o.nameTranslations.de).toBeTruthy());
  });

  it('de: German names with English translations', () => {
    const [size, extras] = buildDefaultOptionGroupSeeds('de');
    expect(size.name).toBe('Größe');
    expect(size.nameTranslations).toEqual({ en: 'Size' });
    expect(size.options[0]).toMatchObject({ name: 'Klein', nameTranslations: { en: 'Small' } });
    expect(extras.nameTranslations).toEqual({ en: 'Extras' });
  });

  it('every price delta is 0', () => {
    for (const lang of ['en', 'de'] as const) {
      for (const g of buildDefaultOptionGroupSeeds(lang)) {
        g.options.forEach((o) => expect(o.priceDelta).toBe(0));
      }
    }
  });
});
