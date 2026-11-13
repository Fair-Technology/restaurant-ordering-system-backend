import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetOrderQueue } from '../../../application/order/intake/executeGetOrderQueue';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getOrderQueue', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/order-queue',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      return mapResultToHttp(await executeGetOrderQueue({ shopId: request.params.shopId }, request));
    } catch (error) {
      return internalServerError('getOrderQueue', error);
    }
  },
});
