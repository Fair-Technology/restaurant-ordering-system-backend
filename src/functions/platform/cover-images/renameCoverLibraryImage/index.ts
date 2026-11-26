import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeRenameCoverLibraryImage } from '../../../../application/coverImageLibrary/renameCoverLibraryImage/executeRenameCoverLibraryImage';
import { mapResultToHttp } from '../../../_shared/mapResultToHttp';
import { internalServerError } from '../../../_shared/internalServerError';

app.http('renameCoverLibraryImage', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'platform/cover-images/{imageId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const imageId = request.params.imageId;
      if (!imageId) {
        return { status: 400, jsonBody: { error: 'imageId path parameter is required' } };
      }
      const body = (await request.json()) as Record<string, unknown>;
      const result = await executeRenameCoverLibraryImage({ imageId, name: body.name as string }, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('renameCoverLibraryImage', error);
    }
  },
});
