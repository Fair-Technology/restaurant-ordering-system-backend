import { describe, it, expect } from 'vitest';
import { swaggerSpec } from '../../src/swagger/swaggerSpec';

describe('swagger public shop list', () => {
  it('swagger lists the public shop list as anonymous', () => {
    const op = (swaggerSpec.paths as any)['/shops/public'].get;
    // The published operationId is preserved: frontend hooks are named from it.
    expect(op.operationId).toBe('listPublicShops');
    // authLevel is anonymous, so the operation opts out of the global bearer auth.
    expect(op.security).toEqual([]);
    expect(op.responses['200'].content['application/json'].schema.$ref).toBe('#/components/schemas/GetPublicShopsResultDto');
  });

  it('public shop schema has only public fields', () => {
    const schemas = swaggerSpec.components.schemas as any;
    expect(Object.keys(schemas.PublicShopSummaryDto.properties).sort()).toEqual([
      'address',
      'branding',
      'id',
      'name',
      'openingHours',
      'ordersPaused',
      'slug',
      'timezone',
    ]);
    expect(schemas.PublicShopSummaryDto.required).toHaveLength(8);
    expect(schemas.GetPublicShopsResultDto.required).toEqual(['shops']);
  });
});
