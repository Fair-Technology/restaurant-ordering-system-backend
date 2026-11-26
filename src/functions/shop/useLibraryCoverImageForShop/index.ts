import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUseLibraryCoverImageForShop } from '../../../application/coverImageLibrary/useLibraryCoverImageForShop/executeUseLibraryCoverImageForShop';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('useLibraryCoverImageForShop', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/cover-image/from-library',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      if (!shopId) {
        return { status: 400, jsonBody: { error: 'shopId path parameter is required' } };
      }
      const body = (await request.json()) as Record<string, unknown>;
      const result = await executeUseLibraryCoverImageForShop({ shopId, libraryImageId: body.libraryImageId as string }, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('useLibraryCoverImageForShop', error);
    }
  },
});
