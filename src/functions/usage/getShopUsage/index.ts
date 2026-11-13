import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetShopUsage } from '../../../application/usage/getShopUsage/executeGetShopUsage';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getShopUsage', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/usage',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const result = await executeGetShopUsage(shopId, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('getShopUsage', error);
    }
  },
});
