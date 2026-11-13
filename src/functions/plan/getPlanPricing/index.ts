import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetPlanPricing } from '../../../application/plan/getPlanPricing/executeGetPlanPricing';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getPlanPricing', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'plans/{planId}/pricing',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const planId = request.params.planId;
      const result = await executeGetPlanPricing(planId, request);
      if (!result.ok) return mapResultToHttp(result);
      return { status: 200, jsonBody: result.data };
    } catch (error) {
      return internalServerError('getPlanPricing', error);
    }
  },
});
