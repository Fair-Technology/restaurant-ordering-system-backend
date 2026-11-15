import { describe, it, expect } from 'vitest';
import { swaggerSpec } from '../../src/swagger/swaggerSpec';

describe('swagger shop logo', () => {
  it('swagger lists the set and remove logo operations', () => {
    const paths = swaggerSpec.paths;
    expect(paths['/shops/{shopId}/logo'].post.operationId).toBe('setShopLogo');
    expect(paths['/shops/{shopId}/logo'].delete.operationId).toBe('removeShopLogo');
  });
});
