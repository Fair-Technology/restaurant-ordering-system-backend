import { describe, it, expect } from 'vitest';
import { swaggerSpec } from '../../src/swagger/swaggerSpec';

describe('swagger public shop list', () => {
  it('swagger lists the public shop list as anonymous', () => {
    const op = (swaggerSpec.paths as any)['/shops/public'].get;
    expect(op.operationId).toBe('listPublicShops');
    expect(op.security).toEqual([]);
    expect(op.responses['200'].content['application/json'].schema.$ref).toBe('#/components/schemas/PublicShopListResponse');
  });

  it('public shop schema has only public fields', () => {
    const schemas = swaggerSpec.components.schemas as any;
    expect(Object.keys(schemas.PublicShopSummary.properties).sort()).toEqual([
      'address', 'branding', 'id', 'name', 'openingHours', 'ordersPaused', 'slug', 'timezone',
    ]);
    expect(schemas.PublicShopSummary.required).toHaveLength(8);
    expect(schemas.PublicShopListResponse.required).toEqual(['shops']);
  });
});
