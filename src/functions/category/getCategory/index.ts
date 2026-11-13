import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetCategory } from '../../../application/category/getCategory/executeGetCategory';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getCategory', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/categories/{categoryId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const categoryId = request.params.categoryId;
      
      const result = await executeGetCategory({ categoryId, shopId }, request);
      
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('getCategory', error);
    }
  }
});
