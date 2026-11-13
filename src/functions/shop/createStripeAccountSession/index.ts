import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeCreateStripeAccountSession } from '../../../application/shop/createStripeAccountSession/executeCreateStripeAccountSession';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('createStripeAccountSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/stripe/account-session',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const body: any = await request.json().catch(() => ({}));
      const purpose = body?.purpose;
      const result = await executeCreateStripeAccountSession({ shopId, purpose }, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('createStripeAccountSession', error);
    }
  },
});
