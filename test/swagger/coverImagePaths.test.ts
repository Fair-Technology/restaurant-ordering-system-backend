import { describe, it, expect } from 'vitest';
import { swaggerSpec } from '../../src/swagger/swaggerSpec';

describe('swagger cover image', () => {
  it('swagger lists the three cover image operations', () => {
    const paths = swaggerSpec.paths as any;
    expect(paths['/shops/{shopId}/cover-image/upload-url'].post.operationId).toBe('generateShopCoverImageUploadUrl');
    expect(paths['/shops/{shopId}/cover-image'].post.operationId).toBe('setShopCoverImage');
    expect(paths['/shops/{shopId}/cover-image'].delete.operationId).toBe('removeShopCoverImage');
    expect((swaggerSpec.components.schemas as any).SetShopCoverImageRequest.required).toEqual(['imageId', 'url']);
  });
});
