import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGenerateShopLogoUploadUrl } from '../../../application/shop/generateShopLogoUploadUrl/executeGenerateShopLogoUploadUrl';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('generateShopLogoUploadUrl', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/logo/upload-url',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const body = await request.json() as any;

      if (!shopId) {
        return { status: 400, jsonBody: { error: 'shopId path parameter is required' } };
      }

      const result = await executeGenerateShopLogoUploadUrl(
        { shopId, contentType: body.contentType },
        request,
      );

      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('generateShopLogoUploadUrl', error);
    }
  },
});
