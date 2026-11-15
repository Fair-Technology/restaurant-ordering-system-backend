import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeNegotiateRealtime } from '../../../application/order/realtime/executeNegotiateRealtime';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('negotiateRealtime', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/realtime/negotiate',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      return mapResultToHttp(await executeNegotiateRealtime({ shopId: request.params.shopId }, request));
    } catch (error) {
      return internalServerError('negotiateRealtime', error);
    }
  },
});
