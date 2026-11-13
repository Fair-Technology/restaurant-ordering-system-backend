import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeDeleteShop } from '../../../application/shop/deleteShop/executeDeleteShop';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('deleteShop', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      
      const result = await executeDeleteShop({ shopId }, request);
      
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('deleteShop', error);
    }
  }
});
