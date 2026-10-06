import { describe, it, expect } from 'vitest';
import { swaggerSpec } from '../../src/swagger/swaggerSpec';

describe('swagger checkout table', () => {
  it('checkout request documents the table', () => {
    expect((swaggerSpec.components.schemas as any).CheckoutRequest.properties.table.type).toBe('string');
  });
});
