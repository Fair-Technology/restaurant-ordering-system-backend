import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeListCoverImageLibraryForShop } from '../../../application/coverImageLibrary/listCoverImageLibraryForShop/executeListCoverImageLibraryForShop';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('listCoverImageLibraryForShop', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/cover-image-library',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      if (!shopId) {
        return { status: 400, jsonBody: { error: 'shopId path parameter is required' } };
      }
      const result = await executeListCoverImageLibraryForShop({ shopId }, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('listCoverImageLibraryForShop', error);
    }
  },
});
