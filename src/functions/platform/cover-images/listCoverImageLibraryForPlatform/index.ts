import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeListCoverImageLibraryForPlatform } from '../../../../application/coverImageLibrary/listCoverImageLibraryForPlatform/executeListCoverImageLibraryForPlatform';
import { mapResultToHttp } from '../../../_shared/mapResultToHttp';
import { internalServerError } from '../../../_shared/internalServerError';

app.http('listCoverImageLibraryForPlatform', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'platform/cover-images',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const result = await executeListCoverImageLibraryForPlatform(request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('listCoverImageLibraryForPlatform', error);
    }
  },
});
