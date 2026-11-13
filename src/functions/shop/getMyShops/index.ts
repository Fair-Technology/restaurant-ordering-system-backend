import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetMyShops } from '../../../application/shop/getMyShops/executeGetMyShops';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getMyShops', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/me',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const result = await executeGetMyShops({}, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('getMyShops', error);
    }
  },
});
