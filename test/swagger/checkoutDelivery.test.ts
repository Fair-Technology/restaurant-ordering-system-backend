import { describe, it, expect } from 'vitest';
import { swaggerSpec } from '../../src/swagger/swaggerSpec';

describe('swagger checkout delivery', () => {
  it('checkout request documents the delivery address', () => {
    const schemas = swaggerSpec.components.schemas;
    const ref = schemas.CheckoutRequestDto.properties.deliveryAddress.$ref.split('/').pop();
    expect(schemas[ref].required).toEqual(['street', 'postcode', 'city']);
  });
});
