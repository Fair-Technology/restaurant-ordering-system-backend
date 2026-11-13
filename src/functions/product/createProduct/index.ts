import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeCreateProduct } from '../../../application/product/createProduct/executeCreateProduct';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('createProduct', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'products',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await request.json() as any;
      
      const result = await executeCreateProduct(body, request);
      
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('createProduct', error);
    }
  }
});
