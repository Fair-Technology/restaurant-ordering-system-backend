import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetPlan } from '../../../application/plan/getPlan/executeGetPlan';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getPlan', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'plans/{planId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const planId = request.params.planId;
      const result = await executeGetPlan(planId, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('getPlan', error);
    }
  },
});
