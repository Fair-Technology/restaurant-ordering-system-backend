import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeSetMissedOrdersPauseLimit } from '../../../application/shop/setMissedOrdersPauseLimit/executeSetMissedOrdersPauseLimit';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('setMissedOrdersPauseLimit', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/missed-orders-pause',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = (await request.json().catch(() => null)) as { limit?: unknown } | null;
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return { status: 400, jsonBody: { error: 'Request body must be a JSON object' } };
      }
      const result = await executeSetMissedOrdersPauseLimit({ shopId: request.params.shopId, limit: body.limit }, request);
      return mapResultToHttp(result);
    } catch {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
