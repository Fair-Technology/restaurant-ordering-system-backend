import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeCheckSlugAvailability } from '../../../application/shop/checkSlugAvailability/executeCheckSlugAvailability';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('checkSlugAvailability', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/slug-available/{slug}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const slug = request.params.slug;

      const result = await executeCheckSlugAvailability({ slug });

      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('checkSlugAvailability', error);
    }
  },
});
