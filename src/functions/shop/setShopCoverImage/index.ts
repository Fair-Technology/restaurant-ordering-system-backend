import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeSetShopCoverImage } from '../../../application/shop/setShopCoverImage/executeSetShopCoverImage';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('setShopCoverImage', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/cover-image',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const body = await request.json() as any;

      if (!shopId) {
        return { status: 400, jsonBody: { error: 'shopId path parameter is required' } };
      }

      const result = await executeSetShopCoverImage(
        { shopId, imageId: body.imageId, url: body.url },
        request,
      );

      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('setShopCoverImage', error);
    }
  },
});
