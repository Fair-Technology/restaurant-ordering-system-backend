import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdateShopLegal } from '../../../application/legal/updateShopLegal/executeUpdateShopLegal';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('updateShopLegal', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/legal',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = (await request.json()) as never;
      const result = await executeUpdateShopLegal({ shopId: request.params.shopId, body }, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('updateShopLegal', error);
    }
  },
});
