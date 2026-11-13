import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetPlans } from '../../../application/plan/getPlans/executeGetPlans';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getPlans', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'plans',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const result = await executeGetPlans(request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('getPlans', error);
    }
  },
});
