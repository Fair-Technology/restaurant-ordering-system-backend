import { describe, it, expect } from 'vitest';
import {
  defaultMenuLanguageForCountry,
  localize,
  normaliseTranslations,
  resolveMenuLanguage,
  validateMenuLanguagesChange,
} from '../../src/domain/menu/menuLanguage';

describe('defaultMenuLanguageForCountry', () => {
  it('returns de for DE/AT/CH and en otherwise', () => {
    expect(defaultMenuLanguageForCountry('DE')).toBe('de');
    expect(defaultMenuLanguageForCountry('at')).toBe('de');
    expect(defaultMenuLanguageForCountry('AU')).toBe('en');
  });
});

describe('resolveMenuLanguage', () => {
  it('resolves the requested, supported or offered-first language', () => {
    expect(resolveMenuLanguage('en', ['de', 'en'])).toBe('en');
    expect(resolveMenuLanguage('fr', ['de', 'en'])).toBe('de');
    expect(resolveMenuLanguage(undefined, ['de'])).toBe('de');
    expect(resolveMenuLanguage('EN-us', ['de', 'en'])).toBe('en');
  });
});

describe('localize', () => {
  it('falls back to the original when the translation is missing or blank', () => {
    expect(localize('Pizza', { en: 'Pizza EN' }, 'en', 'de')).toBe('Pizza EN');
    expect(localize('Pizza', { en: '  ' }, 'en', 'de')).toBe('Pizza');
    expect(localize('Pizza', undefined, 'en', 'de')).toBe('Pizza');
    expect(localize('Pizza', { de: 'x' }, 'de', 'de')).toBe('Pizza');
  });
});

describe('normaliseTranslations', () => {
  it('trims, drops empties and validates language and length', () => {
    expect(normaliseTranslations({ en: ' Hi ', de: '' }, 120)).toEqual({ en: 'Hi' });
    expect(normaliseTranslations({ fr: 'x' }, 120)).toBe('Unsupported language: fr');
    expect(normaliseTranslations('x', 120)).toBe('translations must be an object keyed by language code');
    expect(normaliseTranslations({ en: 'a'.repeat(121) }, 120)).toBe('Translation for en must be at most 120 characters');
    expect(normaliseTranslations(null, 120)).toEqual({});
  });
});

describe('validateMenuLanguagesChange', () => {
  it('accepts adding a supported language', () => {
    expect(validateMenuLanguagesChange(['de'], ['de', 'en'])).toEqual(['de', 'en']);
  });

  it('refuses to change the original language', () => {
    expect(validateMenuLanguagesChange(['de'], ['en'])).toBe('The original menu language (de) cannot be changed');
  });

  it('rejects an unsupported language', () => {
    expect(validateMenuLanguagesChange(['de'], ['de', 'fr'])).toBe('Unsupported language: fr');
  });

  it('dedupes the result', () => {
    expect(validateMenuLanguagesChange(['de'], ['de', 'en', 'en'])).toEqual(['de', 'en']);
  });

  it('requires the original language to remain', () => {
    expect(validateMenuLanguagesChange(['de'], [])).toBe('menuLanguages must contain the original language');
  });

  it('rejects a non-array value', () => {
    expect(validateMenuLanguagesChange(['de'], 'de')).toBe('menuLanguages must be an array');
  });
});
