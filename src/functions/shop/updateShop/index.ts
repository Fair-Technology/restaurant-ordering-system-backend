import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdateShop } from '../../../application/shop/updateShop/executeUpdateShop';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('updateShop', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const body = await request.json() as any;
      
      const result = await executeUpdateShop({ shopId, ...body }, request);
      
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('updateShop', error);
    }
  }
});
