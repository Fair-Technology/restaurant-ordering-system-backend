import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeRemoveShopCoverImage } from '../../../application/shop/removeShopCoverImage/executeRemoveShopCoverImage';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('removeShopCoverImage', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/cover-image',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;

      if (!shopId) {
        return { status: 400, jsonBody: { error: 'shopId path parameter is required' } };
      }

      const result = await executeRemoveShopCoverImage({ shopId }, request);
      return mapResultToHttp(result);
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
