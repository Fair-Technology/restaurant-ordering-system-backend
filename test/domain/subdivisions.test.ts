import { describe, it, expect } from 'vitest';
import {
  countryRequiresState,
  isKnownState,
  subdivisionsForCountry,
} from '../../src/domain/reference/subdivisions';

describe('countryRequiresState', () => {
  it.each(['DE', 'AU', 'US', 'de'])('is true for %s', (c) => {
    expect(countryRequiresState(c)).toBe(true);
  });
  it.each(['GB', 'AT', '', undefined, null])('is false for %s', (c) => {
    expect(countryRequiresState(c as any)).toBe(false);
  });
});

describe('subdivisionsForCountry', () => {
  it('lists the 16 Bundesländer for DE', () => {
    const list = subdivisionsForCountry('DE')!;
    expect(list).toHaveLength(16);
    expect(list).toContainEqual({ code: 'BY', name: 'Bayern' });
  });
  it('has 8 AU and 51 US entries', () => {
    expect(subdivisionsForCountry('AU')).toHaveLength(8);
    expect(subdivisionsForCountry('US')).toHaveLength(51);
  });
  it('returns null for a country without a list', () => {
    expect(subdivisionsForCountry('GB')).toBeNull();
  });
});

describe('isKnownState', () => {
  it.each(['Bayern', 'bayern', 'BY', ' Baden-Württemberg ', 'baden-wurttemberg', 'Baden Württemberg', 'BW'])(
    'knows %s for DE',
    (s) => {
      expect(isKnownState(s, 'DE')).toBe(true);
    },
  );
  it.each(['NRW', 'Atlantis', '', undefined])('does not know %s for DE', (s) => {
    expect(isKnownState(s as any, 'DE')).toBe(false);
  });
  it('accepts any value where the country has no list', () => {
    expect(isKnownState('Anything', 'GB')).toBe(true);
  });
});
