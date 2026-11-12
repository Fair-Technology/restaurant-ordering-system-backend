import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeResumeShopSubscription } from '../../../application/subscription/resumeShopSubscription/executeResumeShopSubscription';
import { internalServerError } from '../../_shared/internalServerError';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('resumeShopSubscription', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/subscription/resume',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const result = await executeResumeShopSubscription(shopId, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('resumeShopSubscription', error);
    }
  },
});
