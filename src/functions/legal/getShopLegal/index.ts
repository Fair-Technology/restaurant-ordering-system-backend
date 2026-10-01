import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetShopLegal } from '../../../application/legal/getShopLegal/executeGetShopLegal';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('getShopLegal', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/legal',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const result = await executeGetShopLegal({ shopId: request.params.shopId }, request);
    return mapResultToHttp(result);
  },
});
