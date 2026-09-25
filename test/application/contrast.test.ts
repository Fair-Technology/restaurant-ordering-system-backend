import { describe, it, expect } from 'vitest';
import { contrastRatio, validateAccentColor } from '../../src/application/_shared/contrast';

describe('contrastRatio', () => {
  it('white on white', () => {
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
  });

  it('black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBe(21);
  });

  it('default accent', () => {
    expect(contrastRatio('#C2410C', '#FFFFFF').toFixed(2)).toBe('5.18');
  });
});

describe('validateAccentColor', () => {
  it('accepts a dark accent', () => {
    expect(validateAccentColor('#E63946')).toBeNull();
  });

  it('rejects pale yellow', () => {
    expect(validateAccentColor('#FFFF66')).toBe(
      'branding.accentColor is too light to read on white (contrast 1.06:1, needs at least 3:1)',
    );
  });

  it('rejects the old default orange', () => {
    expect(validateAccentColor('#FF8C32')).toContain('2.32:1');
  });

  it('rejects short hex', () => {
    expect(validateAccentColor('#fff')).toBe('branding.accentColor must be a hex colour like "#C2410C"');
  });

  it('null is allowed', () => {
    expect(validateAccentColor(null)).toBeNull();
  });

  it('seed accents pass', () => {
    for (const c of ['#C0392B', '#2C3E50', '#D35400', '#229954']) {
      expect(validateAccentColor(c)).toBeNull();
    }
  });
});
