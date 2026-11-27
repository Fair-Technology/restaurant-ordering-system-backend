import { describe, expect, it } from 'vitest';
import { stripeAccountCreateParams } from '../../src/domain/shop/Shop';

const shop = { id: 'shop-1', countryCode: 'DE', name: 'Trattoria Roma' };

describe('stripeAccountCreateParams', () => {
  it("creates the restaurant's Stripe account in the restaurant's country, not the platform's", () => {
    expect(stripeAccountCreateParams(shop, null)).toEqual({
      country: 'DE',
      metadata: { shopId: 'shop-1' },
      business_profile: { product_description: 'Online food ordering for Trattoria Roma' },
    });
  });

  it('follows the shop for restaurants outside Germany', () => {
    expect(stripeAccountCreateParams({ ...shop, id: 'shop-2', countryCode: 'AU' }, null).country).toBe('AU');
  });

  it('prefills the business website with the storefront url when given', () => {
    const params = stripeAccountCreateParams(shop, 'https://shop.example/shops/roma');
    expect(params.business_profile.url).toBe('https://shop.example/shops/roma');
  });

  it('leaves the url out entirely when there is no public storefront', () => {
    const params = stripeAccountCreateParams(shop, null);
    expect('url' in params.business_profile).toBe(false);
  });

  it("always sends a product description naming the shop", () => {
    expect(stripeAccountCreateParams(shop, null).business_profile.product_description).toContain('Trattoria Roma');
  });
});
