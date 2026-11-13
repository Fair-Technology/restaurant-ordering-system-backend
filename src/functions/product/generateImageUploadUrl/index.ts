import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGenerateImageUploadUrl } from '../../../application/product/generateImageUploadUrl/executeGenerateImageUploadUrl';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('generateImageUploadUrl', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/products/{productId}/images/upload-url',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const productId = request.params.productId;
      const body = await request.json() as any;

      if (!shopId) {
        return {
          status: 400,
          jsonBody: { error: 'shopId path parameter is required' }
        };
      }

      if (!productId) {
        return {
          status: 400,
          jsonBody: { error: 'productId path parameter is required' }
        };
      }

      const requestDto = {
        shopId,
        productId,
        contentType: body.contentType,
        fileName: body.fileName,
        maxSizeBytes: body.maxSizeBytes,
      };

      const result = await executeGenerateImageUploadUrl(requestDto, request);

      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('generateImageUploadUrl', error);
    }
  }
});
