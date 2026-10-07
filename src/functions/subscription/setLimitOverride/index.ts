import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeSetLimitOverride } from '../../../application/subscription/limitOverride/executeSetLimitOverride';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('setLimitOverride', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/subscription/limit-override',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const body = await request.json() as any;
      const result = await executeSetLimitOverride(shopId, body, request);
      return mapResultToHttp(result);
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
