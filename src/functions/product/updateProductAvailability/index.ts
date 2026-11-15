import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdateProductAvailability } from '../../../application/product/updateProductAvailability/executeUpdateProductAvailability';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('updateProductAvailability', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'products/{productId}/availability',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const productId = request.params.productId;
      const body = (await request.json()) as any;

      const result = await executeUpdateProductAvailability({ productId, ...body }, request);

      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('updateProductAvailability', error);
    }
  },
});
