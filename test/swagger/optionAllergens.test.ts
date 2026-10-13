import { describe, it, expect } from 'vitest';
import { swaggerSpec } from '../../src/swagger/swaggerSpec';

describe('option allergens in swagger', () => {
  it('options document their allergens and additives', () => {
    const schemas = (swaggerSpec as any).components.schemas;
    for (const name of ['VariantOption', 'AddonOption']) {
      const s = schemas[name];
      expect(s.properties.allergenIds.items.type).toBe('string');
      expect(s.properties.additiveIds.items.type).toBe('string');
      expect(s.properties.allergens.items.$ref).toBe('#/components/schemas/CatalogLabel');
      expect(s.properties.additives.items.required).toEqual(['id', 'code', 'label']);
      expect(s.required).toEqual(['id', 'name', 'priceDelta', 'isAvailable']);
    }
  });
});
