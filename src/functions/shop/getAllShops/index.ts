import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetAllShops } from '../../../application/shop/getAllShops/executeGetAllShops';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('getAllShops', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const result = await executeGetAllShops({}, request);

      return mapResultToHttp(result);
    } catch (error) {
      return {
        status: 500,
        jsonBody: { error: 'Internal server error' },
      };
    }
  },
});
