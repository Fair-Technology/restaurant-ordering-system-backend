import { describe, it, expect } from 'vitest';
import { swaggerSpec } from '../../src/swagger/swaggerSpec';

describe('swagger checkout combos', () => {
  it('checkout items document combo choices', () => {
    const props = (swaggerSpec.components.schemas as any).CheckoutItem.properties;
    expect(props.comboChoices.type).toBe('array');
    expect(props.comboChoices.items.required).toEqual(['groupId', 'productId']);
  });
});
