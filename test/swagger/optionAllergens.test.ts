import { describe, it, expect } from 'vitest';
import { swaggerSpec } from '../../src/swagger/swaggerSpec';

describe('option allergens in swagger', () => {
  it('options document the allergen and additive ids they carry', () => {
    const option = swaggerSpec.components.schemas.ProductOption;
    expect(option.properties.allergenIds.items.type).toBe('string');
    expect(option.properties.additiveIds.items.type).toBe('string');
    expect(option.required).toEqual(['id', 'name', 'priceDelta', 'isAvailable']);
  });

  it('the catalog view resolves those ids to labels', () => {
    const schemas = swaggerSpec.components.schemas;
    const catalog = schemas.CatalogOptionDto;
    expect(catalog.properties.allergens.items.$ref).toBe('#/components/schemas/CatalogLabelDto');
    expect(catalog.properties.additives.items.$ref).toBe('#/components/schemas/CatalogAdditiveDto');
    expect(schemas.CatalogAdditiveDto.required).toEqual(['id', 'code', 'label']);
  });
});
