import { describe, expect, it } from 'vitest';
import { stripeAccountCreateParams } from '../../src/domain/shop/Shop';

describe('stripeAccountCreateParams', () => {
  it("creates the restaurant's Stripe account in the restaurant's country, not the platform's", () => {
    expect(stripeAccountCreateParams({ id: 'shop-1', countryCode: 'DE' })).toEqual({
      country: 'DE',
      metadata: { shopId: 'shop-1' },
    });
  });

  it('follows the shop for restaurants outside Germany', () => {
    expect(stripeAccountCreateParams({ id: 'shop-2', countryCode: 'AU' }).country).toBe('AU');
  });
});
