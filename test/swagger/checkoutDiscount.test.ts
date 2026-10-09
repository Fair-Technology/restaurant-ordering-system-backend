import { describe, it, expect } from 'vitest';
import { swaggerSpec } from '../../src/swagger/swaggerSpec';

describe('swagger checkout discounts', () => {
  it('checkout request documents the discount fields', () => {
    const props = (swaggerSpec.components.schemas as any).CheckoutRequest.properties;
    expect(props.discountCode.type).toBe('string');
    expect(props.expectedDiscountCents.type).toBe('integer');
    expect(props.loyaltyOptIn.type).toBe('boolean');
  });
});
