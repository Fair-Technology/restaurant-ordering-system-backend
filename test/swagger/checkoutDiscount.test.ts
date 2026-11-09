import { describe, it, expect } from 'vitest';
import { swaggerSpec } from '../../src/swagger/swaggerSpec';

describe('swagger checkout discounts', () => {
  it('checkout request documents the discount fields', () => {
    const props = swaggerSpec.components.schemas.CheckoutRequestDto.properties;
    expect(props.discountCode.type).toBe('string');
    // The DTO types this as number; the old hand-written spec claimed an integer.
    expect(props.expectedDiscountCents.type).toBe('number');
    expect(props.loyaltyOptIn.type).toBe('boolean');
  });
});
