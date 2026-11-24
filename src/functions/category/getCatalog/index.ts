import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetCatalog } from '../../../application/category/getCatalog/executeGetCatalog';
import { compressJsonResponse } from '../../_shared/compressJsonResponse';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('getCatalog', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/catalog',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const shopId = request.params.shopId;
    const result = await executeGetCatalog({ shopId, lang: request.query.get('lang') ?? undefined });
    if (!result.ok) return mapResultToHttp(result);
    return compressJsonResponse(request, result.data);
  },
});
