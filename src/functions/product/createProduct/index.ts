import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeCreateProduct } from '../../../application/product/createProduct/executeCreateProduct';
import { PRODUCT_IMAGE_REQUIRED_TO_ENABLE } from '../../../domain/images/imageRules';
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
      
      if (!result.ok && result.code === PRODUCT_IMAGE_REQUIRED_TO_ENABLE) {
        return { status: 400, jsonBody: { error: result.error, code: result.code } };
      }
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('createProduct', error);
    }
  }
});
