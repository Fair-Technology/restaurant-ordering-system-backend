import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeApproveShopNameChange } from '../../../application/shop/approveShopNameChange/executeApproveShopNameChange';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('approveShopNameChange', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/name-change-request/approve',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;

      const result = await executeApproveShopNameChange({ shopId }, request);

      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('approveShopNameChange', error);
    }
  },
});
