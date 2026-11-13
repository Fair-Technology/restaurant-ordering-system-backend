import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeRejectShopNameChange } from '../../../application/shop/rejectShopNameChange/executeRejectShopNameChange';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('rejectShopNameChange', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/name-change-request',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;

      const result = await executeRejectShopNameChange({ shopId }, request);

      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('rejectShopNameChange', error);
    }
  },
});
