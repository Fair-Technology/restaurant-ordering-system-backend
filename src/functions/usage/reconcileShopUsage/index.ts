import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeReconcileShopUsage } from '../../../application/usage/reconcileShopUsage/executeReconcileShopUsage';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('reconcileShopUsage', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/usage/reconcile',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const result = await executeReconcileShopUsage(shopId, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('reconcileShopUsage', error);
    }
  },
});
