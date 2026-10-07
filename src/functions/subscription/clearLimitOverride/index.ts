import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeClearLimitOverride } from '../../../application/subscription/limitOverride/executeClearLimitOverride';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('clearLimitOverride', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/subscription/limit-override',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const result = await executeClearLimitOverride(shopId, request);
      return mapResultToHttp(result);
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
