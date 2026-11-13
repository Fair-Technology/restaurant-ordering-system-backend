import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetAllShops } from '../../../application/shop/getAllShops/executeGetAllShops';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getAllShops', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const result = await executeGetAllShops({}, request);

      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('getAllShops', error);
    }
  },
});
