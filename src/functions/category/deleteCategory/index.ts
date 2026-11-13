import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeDeleteCategory } from '../../../application/category/deleteCategory/executeDeleteCategory';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('deleteCategory', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/categories/{categoryId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const categoryId = request.params.categoryId;
      
      const result = await executeDeleteCategory({ categoryId, shopId }, request);
      
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('deleteCategory', error);
    }
  }
});
