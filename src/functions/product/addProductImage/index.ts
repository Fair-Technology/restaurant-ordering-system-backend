import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeAddProductImage } from '../../../application/product/addProductImage/executeAddProductImage';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('addProductImage', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/products/{productId}/images',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const productId = request.params.productId;
      const body = await request.json() as any;

      if (!shopId) {
        return {
          status: 400,
          jsonBody: { error: 'shopId path parameter is required' }
        };
      }

      if (!productId) {
        return {
          status: 400,
          jsonBody: { error: 'productId path parameter is required' }
        };
      }

      const requestDto = {
        shopId,
        productId,
        imageId: body.imageId,
        url: body.url,
        alt: body.alt,
        sortOrder: body.sortOrder,
      };

      const result = await executeAddProductImage(requestDto, request);

      return mapResultToHttp(result);
    } catch (error) {
      console.error('[addProductImage] failed:', error);
      return {
        status: 500,
        jsonBody: { error: 'Internal server error' }
      };
    }
  }
});
