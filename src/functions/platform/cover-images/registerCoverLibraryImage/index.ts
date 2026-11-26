import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeRegisterCoverLibraryImage } from '../../../../application/coverImageLibrary/registerCoverLibraryImage/executeRegisterCoverLibraryImage';
import { mapResultToHttp } from '../../../_shared/mapResultToHttp';
import { internalServerError } from '../../../_shared/internalServerError';

app.http('registerCoverLibraryImage', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'platform/cover-images',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      const result = await executeRegisterCoverLibraryImage(
        { imageId: body.imageId as string, url: body.url as string, name: body.name as string },
        request,
      );
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('registerCoverLibraryImage', error);
    }
  },
});
