import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetProduct } from '../../../application/product/getProduct/executeGetProduct';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getProduct', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'products/{productId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const productId = request.params.productId;
      const shopId = request.query.get('shopId');
      
      if (!shopId) {
        return {
          status: 400,
          jsonBody: { error: 'shopId query parameter is required' }
        };
      }
      
      const result = await executeGetProduct({ productId, shopId }, request);
      
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('getProduct', error);
    }
  }
});
