import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdateCategory } from '../../../application/category/updateCategory/executeUpdateCategory';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('updateCategory', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/categories/{categoryId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const categoryId = request.params.categoryId;
      const body = await request.json() as any;
      
      // Add shopId and categoryId from route params to the request body
      const requestWithParams = {
        ...body,
        shopId,
        categoryId
      };
      
      const result = await executeUpdateCategory(requestWithParams, request);
      
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('updateCategory', error);
    }
  }
});
