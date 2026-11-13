import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeRestoreShop } from '../../../application/shop/restoreShop/executeRestoreShop';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('restoreShop', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/restore',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const result = await executeRestoreShop({ shopId: request.params.shopId }, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('restoreShop', error);
    }
  },
});
