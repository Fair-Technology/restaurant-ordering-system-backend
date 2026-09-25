import { describe, it, expect } from 'vitest';
import { seedTaxRatesForCountry } from '../../src/application/_shared/countryTaxRates';

describe('seedTaxRatesForCountry', () => {
  it('seeds the three German tax rates', () => {
    const rates = seedTaxRatesForCountry('DE').map((r) => [r.label, r.rate]);
    expect(rates).toEqual([
      ['Standard (19%)', 0.19],
      ['Reduced (7%)', 0.07],
      ['Zero (0%)', 0],
    ]);
  });

  it('falls back to a single zero rate for an unknown country', () => {
    const rates = seedTaxRatesForCountry('XX').map(({ label, rate }) => ({ label, rate }));
    expect(rates).toEqual([{ label: 'No Tax (0%)', rate: 0 }]);
  });
});
