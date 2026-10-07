import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetOrderLimit } from '../../../application/usage/getOrderLimit/executeGetOrderLimit';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('getOrderLimit', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/order-limit',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const result = await executeGetOrderLimit(shopId, request);
      return mapResultToHttp(result);
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
