import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeDeleteCoverLibraryImage } from '../../../../application/coverImageLibrary/deleteCoverLibraryImage/executeDeleteCoverLibraryImage';
import { mapResultToHttp } from '../../../_shared/mapResultToHttp';
import { internalServerError } from '../../../_shared/internalServerError';

app.http('deleteCoverLibraryImage', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'platform/cover-images/{imageId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const imageId = request.params.imageId;
      if (!imageId) {
        return { status: 400, jsonBody: { error: 'imageId path parameter is required' } };
      }
      const result = await executeDeleteCoverLibraryImage({ imageId }, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('deleteCoverLibraryImage', error);
    }
  },
});
