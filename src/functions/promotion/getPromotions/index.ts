import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetPromotions } from '../../../application/promotion/getPromotions/executeGetPromotions';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('getPromotions', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/promotions',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      return mapResultToHttp(await executeGetPromotions({ shopId: request.params.shopId }, request));
    } catch {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
