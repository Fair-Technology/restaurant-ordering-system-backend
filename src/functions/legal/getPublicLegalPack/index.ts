import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetPublicLegalPack } from '../../../application/legal/getPublicLegalPack/executeGetPublicLegalPack';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('getPublicLegalPack', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/slug/{slug}/legal',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const result = await executeGetPublicLegalPack({
      slug: request.params.slug,
      lang: request.query.get('lang'),
    });
    return mapResultToHttp(result);
  },
});
