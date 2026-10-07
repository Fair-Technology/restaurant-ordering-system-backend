import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetRejectionWatch } from '../../../application/usage/rejectionWatch/executeGetRejectionWatch';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('getRejectionWatch', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'usage/rejection-watch',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const result = await executeGetRejectionWatch(request);
      return mapResultToHttp(result);
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
