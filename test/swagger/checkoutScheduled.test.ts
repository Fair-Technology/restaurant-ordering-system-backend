import { describe, it, expect } from 'vitest';
import { swaggerSpec } from '../../src/swagger/swaggerSpec';

describe('swagger checkout scheduled orders', () => {
  it('checkout request documents scheduledFor', () => {
    expect((swaggerSpec.components.schemas as any).CheckoutRequest.properties.scheduledFor.format).toBe('date-time');
  });

  it('checkout request documents the checkout it replaces', () => {
    const props = (swaggerSpec.components.schemas as any).CheckoutRequest.properties;
    expect(props.replacesOrderId.type).toBe('string');
    expect(props.replacesAccessToken.type).toBe('string');
  });

  it('catalog documents categories for other times', () => {
    const schemas = swaggerSpec.components.schemas as any;
    expect(schemas.CatalogCategoryDto.properties.availableNow.type).toBe('boolean');
    expect(schemas.CatalogCategoryDto.properties.schedule.nullable).toBe(true);
    expect(schemas.CatalogProductDto.properties.availableNow.type).toBe('boolean');
  });
});
