import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdateProduct } from '../../../application/product/updateProduct/executeUpdateProduct';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('updateProduct', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'products/{productId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const productId = request.params.productId;
      const body = await request.json() as any;
      
      const result = await executeUpdateProduct({ productId, ...body }, request);
      
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('updateProduct', error);
    }
  }
});
