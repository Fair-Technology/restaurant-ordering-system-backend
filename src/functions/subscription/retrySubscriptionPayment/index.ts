import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeRetrySubscriptionPayment } from '../../../application/subscription/retryPayment/executeRetrySubscriptionPayment';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('retrySubscriptionPayment', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/subscription/retry-payment',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const result = await executeRetrySubscriptionPayment(shopId, request);
      return mapResultToHttp(result);
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
