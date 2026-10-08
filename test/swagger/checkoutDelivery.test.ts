import { describe, it, expect } from 'vitest';
import { swaggerSpec } from '../../src/swagger/swaggerSpec';

describe('swagger checkout delivery', () => {
  it('checkout request documents the delivery address', () => {
    expect((swaggerSpec.components.schemas as any).CheckoutRequest.properties.deliveryAddress.required).toEqual([
      'street',
      'postcode',
      'city',
    ]);
  });
});
