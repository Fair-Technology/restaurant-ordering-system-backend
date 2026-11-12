import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeCancelShopSubscription } from '../../../application/subscription/cancelShopSubscription/executeCancelShopSubscription';
import { internalServerError } from '../../_shared/internalServerError';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('cancelShopSubscription', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/subscription',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const result = await executeCancelShopSubscription(shopId, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('cancelShopSubscription', error);
    }
  },
});
