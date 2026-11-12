import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeCreateBillingPortalSession } from '../../../application/subscription/billingPortal/executeCreateBillingPortalSession';
import { internalServerError } from '../../_shared/internalServerError';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('createBillingPortalSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/subscription/portal',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const result = await executeCreateBillingPortalSession(shopId, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('createBillingPortalSession', error);
    }
  },
});
