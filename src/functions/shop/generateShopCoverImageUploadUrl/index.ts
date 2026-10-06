import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGenerateShopCoverImageUploadUrl } from '../../../application/shop/generateShopCoverImageUploadUrl/executeGenerateShopCoverImageUploadUrl';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('generateShopCoverImageUploadUrl', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/cover-image/upload-url',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const body = await request.json() as any;

      if (!shopId) {
        return { status: 400, jsonBody: { error: 'shopId path parameter is required' } };
      }

      const result = await executeGenerateShopCoverImageUploadUrl(
        { shopId, contentType: body.contentType },
        request,
      );

      return mapResultToHttp(result);
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
