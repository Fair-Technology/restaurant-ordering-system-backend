import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetPublicShops } from '../../../application/shop/getPublicShops/executeGetPublicShops';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

// Public: the diner home page. Listed = not deleted and not offline. Public fields only.
app.http('getPublicShops', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/public',
  handler: async (_request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      return mapResultToHttp(await executeGetPublicShops());
    } catch (error) {
      return internalServerError('getPublicShops', error);
    }
  },
});
