import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeCreateCategory } from '../../../application/category/createCategory/executeCreateCategory';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('createCategory', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/categories',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const body = await request.json() as any;
      
      // Add shopId from route params to the request body
      const requestWithShopId = {
        ...body,
        shopId
      };
      
      const result = await executeCreateCategory(requestWithShopId, request);
      
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('createCategory', error);
    }
  }
});
