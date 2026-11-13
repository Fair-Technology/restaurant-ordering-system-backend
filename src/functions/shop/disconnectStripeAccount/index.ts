import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeDisconnectStripeAccount } from '../../../application/shop/disconnectStripeAccount/executeDisconnectStripeAccount';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('disconnectStripeAccount', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/stripe/account',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const result = await executeDisconnectStripeAccount({ shopId }, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('disconnectStripeAccount', error);
    }
  },
});
