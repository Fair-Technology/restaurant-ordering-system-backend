import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetShop } from '../../../application/shop/getShop/executeGetShop';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getShop', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      
      const result = await executeGetShop({ shopId }, request);
      
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('getShop', error);
    }
  }
});
