import { describe, it, expect } from 'vitest';
import { isShopAddressComplete, shopAddressRequirement } from '../../src/domain/shop/addressReadiness';

const base = { street: 'Main St 1', city: 'Munich', postcode: '80331', country: 'Germany' };

describe('isShopAddressComplete', () => {
  it('is complete for a German address with a state', () => {
    expect(isShopAddressComplete({ ...base, state: 'Bayern' }, 'DE')).toBe(true);
  });
  it('is not complete for a German address with a missing or blank state', () => {
    expect(isShopAddressComplete(base, 'DE')).toBe(false);
    expect(isShopAddressComplete({ ...base, state: '  ' }, 'DE')).toBe(false);
  });
  it('requires the state for AU', () => {
    expect(isShopAddressComplete({ ...base, country: 'Australia', state: 'NSW' }, 'AU')).toBe(true);
    expect(isShopAddressComplete({ ...base, country: 'Australia' }, 'AU')).toBe(false);
  });
  it('does not require the state where the country has no list', () => {
    expect(isShopAddressComplete(base, 'GB')).toBe(true);
    expect(isShopAddressComplete({ ...base, state: 'Whatever' }, 'GB')).toBe(true);
  });
  it('still requires the other fields', () => {
    expect(isShopAddressComplete({ ...base, street: ' ' }, 'GB')).toBe(false);
    expect(isShopAddressComplete(undefined, 'GB')).toBe(false);
  });
});

describe('shopAddressRequirement', () => {
  it('mentions state only where it is required', () => {
    expect(shopAddressRequirement('DE')).toContain('state');
    expect(shopAddressRequirement('GB')).not.toContain('state');
  });
});
