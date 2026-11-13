import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdatePlan } from '../../../application/plan/updatePlan/executeUpdatePlan';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('updatePlan', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'plans/{planId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const planId = request.params.planId;
      const body = await request.json() as any;
      const result = await executeUpdatePlan(planId, body, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('updatePlan', error);
    }
  },
});
