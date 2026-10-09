import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetCombos } from '../../../application/combo/getCombos/executeGetCombos';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('getCombos', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/combos',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      return mapResultToHttp(await executeGetCombos({ shopId: request.params.shopId }, request));
    } catch {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
