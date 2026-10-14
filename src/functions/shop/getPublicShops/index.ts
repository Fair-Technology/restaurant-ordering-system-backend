import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetPublicShops } from '../../../application/shop/getPublicShops/executeGetPublicShops';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

// Public: the diner home page. Listed = not deleted and not offline. Public fields only.
app.http('getPublicShops', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/public',
  handler: async (_request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      return mapResultToHttp(await executeGetPublicShops());
    } catch {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
