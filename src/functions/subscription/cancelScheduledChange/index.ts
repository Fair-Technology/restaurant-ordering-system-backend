import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeCancelScheduledChange } from '../../../application/subscription/cancelScheduledChange/executeCancelScheduledChange';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('cancelScheduledChange', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/subscription/scheduled-change',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const result = await executeCancelScheduledChange(shopId, request);
      return mapResultToHttp(result);
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
