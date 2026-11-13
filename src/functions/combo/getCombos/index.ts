import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetCombos } from '../../../application/combo/getCombos/executeGetCombos';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getCombos', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/combos',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      return mapResultToHttp(await executeGetCombos({ shopId: request.params.shopId }, request));
    } catch (error) {
      return internalServerError('getCombos', error);
    }
  },
});
