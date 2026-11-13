import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeCreatePlan } from '../../../application/plan/createPlan/executeCreatePlan';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('createPlan', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'plans',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await request.json() as any;
      const result = await executeCreatePlan(body, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('createPlan', error);
    }
  },
});
