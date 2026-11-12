import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeRetrySubscriptionPayment } from '../../../application/subscription/retryPayment/executeRetrySubscriptionPayment';
import { internalServerError } from '../../_shared/internalServerError';
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
      return internalServerError('retrySubscriptionPayment', error);
    }
  },
});
