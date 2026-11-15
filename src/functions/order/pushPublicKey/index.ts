import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetPushPublicKey } from '../../../application/order/push/executeGetPushPublicKey';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getPushPublicKey', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/push/public-key',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      return mapResultToHttp(await executeGetPushPublicKey({ shopId: request.params.shopId }, request));
    } catch (error) {
      return internalServerError('getPushPublicKey', error);
    }
  },
});
