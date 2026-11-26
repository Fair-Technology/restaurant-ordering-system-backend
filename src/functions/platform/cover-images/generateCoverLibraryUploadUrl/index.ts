import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGenerateCoverLibraryUploadUrl } from '../../../../application/coverImageLibrary/generateCoverLibraryUploadUrl/executeGenerateCoverLibraryUploadUrl';
import { mapResultToHttp } from '../../../_shared/mapResultToHttp';
import { internalServerError } from '../../../_shared/internalServerError';

app.http('generateCoverLibraryUploadUrl', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'platform/cover-images/upload-url',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      const result = await executeGenerateCoverLibraryUploadUrl({ contentType: body.contentType as string }, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('generateCoverLibraryUploadUrl', error);
    }
  },
});
