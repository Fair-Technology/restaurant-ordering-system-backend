import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeRemoveShopLogo } from '../../../application/shop/removeShopLogo/executeRemoveShopLogo';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('removeShopLogo', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/logo',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;

      if (!shopId) {
        return { status: 400, jsonBody: { error: 'shopId path parameter is required' } };
      }

      const result = await executeRemoveShopLogo({ shopId }, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('removeShopLogo', error);
    }
  },
});
