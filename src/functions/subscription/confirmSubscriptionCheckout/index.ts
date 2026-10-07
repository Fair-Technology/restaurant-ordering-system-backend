import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeConfirmSubscriptionCheckout } from '../../../application/subscription/confirmCheckout/executeConfirmSubscriptionCheckout';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('confirmSubscriptionCheckout', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/subscription/checkout/confirm',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const result = await executeConfirmSubscriptionCheckout(shopId, request);
      return mapResultToHttp(result);
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
