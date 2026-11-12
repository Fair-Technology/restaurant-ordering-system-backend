import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeOverrideShopSubscription } from '../../../application/subscription/overrideShopSubscription/executeOverrideShopSubscription';
import { internalServerError } from '../../_shared/internalServerError';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('overrideShopSubscription', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/subscription/override',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const body = await request.json() as any;
      const result = await executeOverrideShopSubscription(shopId, body, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('overrideShopSubscription', error);
    }
  },
});
