import { describe, it, expect } from 'vitest';
import { assertSeedTargetIsDev } from '../../scripts/seedGuard';

describe('assertSeedTargetIsDev', () => {
  it('allows the restaurant-ordering dev database', () => {
    expect(() =>
      assertSeedTargetIsDev('https://restaurant-ordering-system-db-dev.documents.azure.com:443/'),
    ).not.toThrow();
  });

  it('refuses a database that is not the dev one', () => {
    // Any non-dev host, deliberately a placeholder: the guard compares hostnames
    // as strings and resolves nothing, so the fixture does not need to name a
    // real database.
    expect(() =>
      assertSeedTargetIsDev('https://xyz.documents.azure.com:443/'),
    ).toThrow(
      'Refusing to seed: xyz.documents.azure.com is not the restaurant-ordering dev database',
    );
  });

  it('allows no endpoint, defaulting to the local emulator', () => {
    expect(() => assertSeedTargetIsDev(undefined)).not.toThrow();
  });

  it('allows the local Cosmos emulator', () => {
    expect(() => assertSeedTargetIsDev('https://localhost:8081')).not.toThrow();
  });
});
