import { describe, it, expect } from 'vitest';
import { swaggerSpec } from '../../src/swagger/swaggerSpec';

describe('swagger cover image', () => {
  it('swagger lists the three cover image operations', () => {
    const paths = swaggerSpec.paths;
    expect(paths['/shops/{shopId}/cover-image/upload-url'].post.operationId).toBe('generateShopCoverImageUploadUrl');
    expect(paths['/shops/{shopId}/cover-image'].post.operationId).toBe('setShopCoverImage');
    expect(paths['/shops/{shopId}/cover-image'].delete.operationId).toBe('removeShopCoverImage');
  });

  it('the set request body is imageId and url, with shopId coming from the path', () => {
    const body = swaggerSpec.paths['/shops/{shopId}/cover-image'].post.requestBody.content['application/json'].schema;
    expect(body.required).toEqual(['imageId', 'url']);
    // The handler reads shopId from request.params, so it is not a body field.
    expect(body.properties.shopId).toBeUndefined();
  });
});
