import { describe, it, expect } from 'vitest';
import { swaggerSpec } from '../../src/swagger/swaggerSpec';

describe('swagger checkout combos', () => {
  it('checkout items document combo choices', () => {
    const schemas = swaggerSpec.components.schemas;
    const comboChoices = schemas.CheckoutItemDto.properties.comboChoices;
    expect(comboChoices.type).toBe('array');
    // The item is a $ref; one picked dish per group, with its own size and extras.
    const choice = schemas[comboChoices.items.$ref.split('/').pop()];
    expect(choice.required).toEqual(['groupId', 'productId']);
  });
});
