import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeSetPlanPricing } from '../../../application/plan/setPlanPricing/executeSetPlanPricing';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('setPlanPricing', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'plans/{planId}/pricing',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const planId = request.params.planId;
      const body = await request.json() as any;
      const result = await executeSetPlanPricing(planId, body, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('setPlanPricing', error);
    }
  },
});
