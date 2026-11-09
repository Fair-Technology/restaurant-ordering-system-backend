import { describe, it, expect } from 'vitest';
import { swaggerSpec } from '../../src/swagger/swaggerSpec';

describe('swagger checkout scheduled orders', () => {
  it('checkout request documents scheduledFor as a slot string', () => {
    // The DTO types this as a plain string ("a slot start from the quote's slots").
    // The old hand-written spec asserted a date-time format the code never declared.
    const props = swaggerSpec.components.schemas.CheckoutRequestDto.properties;
    expect(props.scheduledFor.type).toBe('string');
  });

  it('checkout request documents the checkout it replaces', () => {
    const props = swaggerSpec.components.schemas.CheckoutRequestDto.properties;
    expect(props.replacesOrderId.type).toBe('string');
    expect(props.replacesAccessToken.type).toBe('string');
  });

  it('catalog documents categories for other times', () => {
    const schemas = swaggerSpec.components.schemas;
    expect(schemas.CatalogCategoryDto.properties.availableNow.type).toBe('boolean');
    expect(schemas.CatalogCategoryDto.properties.schedule.nullable).toBe(true);
    expect(schemas.CatalogProductDto.properties.availableNow.type).toBe('boolean');
  });
});
