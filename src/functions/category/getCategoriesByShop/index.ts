import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetCategoriesByShop } from '../../../application/category/getCategoriesByShop/executeGetCategoriesByShop';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getCategoriesByShop', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/categories',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      
      const result = await executeGetCategoriesByShop({ shopId }, request);
      
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('getCategoriesByShop', error);
    }
  }
});
