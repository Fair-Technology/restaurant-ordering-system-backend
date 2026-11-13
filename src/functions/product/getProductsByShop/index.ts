import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetProductsByShop } from '../../../application/product/getProductsByShop/executeGetProductsByShop';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getProductsByShop', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'products',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.query.get('shopId');
      
      if (!shopId) {
        return {
          status: 400,
          jsonBody: { error: 'shopId query parameter is required' }
        };
      }
      
      const includeUncategorized = request.query.get('includeUncategorized') === 'true';
      const result = await executeGetProductsByShop({ shopId }, request, { includeUncategorized });
      
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('getProductsByShop', error);
    }
  }
});
