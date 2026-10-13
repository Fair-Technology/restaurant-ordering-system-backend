import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeOrdersScreenHeartbeat } from '../../../application/order/intake/executeOrdersScreenHeartbeat';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('ordersScreenHeartbeat', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/orders-screen/heartbeat',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      return mapResultToHttp(await executeOrdersScreenHeartbeat({ shopId: request.params.shopId }, request));
    } catch {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
