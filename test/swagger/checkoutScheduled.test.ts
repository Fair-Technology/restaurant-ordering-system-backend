import { describe, it, expect } from 'vitest';
import { swaggerSpec } from '../../src/swagger/swaggerSpec';

describe('swagger checkout scheduled orders', () => {
  it('checkout request documents scheduledFor', () => {
    expect((swaggerSpec.components.schemas as any).CheckoutRequest.properties.scheduledFor.format).toBe('date-time');
  });
});
