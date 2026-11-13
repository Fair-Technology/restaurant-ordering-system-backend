import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetOwnerOverview } from '../../../application/report/getOwnerOverview/executeGetOwnerOverview';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getOwnerOverview', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'owner/overview',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      return mapResultToHttp(await executeGetOwnerOverview(request));
    } catch (error) {
      return internalServerError('getOwnerOverview', error);
    }
  },
});
