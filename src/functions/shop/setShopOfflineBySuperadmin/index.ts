import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeSetShopOfflineBySuperadmin } from '../../../application/shop/setShopOfflineBySuperadmin/executeSetShopOfflineBySuperadmin';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('setShopOfflineBySuperadmin', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/superadmin-offline',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = (await request.json().catch(() => null)) as { offline?: unknown; reason?: unknown } | null;
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return { status: 400, jsonBody: { error: 'Request body must be a JSON object' } };
      }
      const result = await executeSetShopOfflineBySuperadmin(
        { shopId: request.params.shopId, offline: body.offline as boolean, reason: body.reason as string | undefined },
        request,
      );
      return mapResultToHttp(result);
    } catch {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
