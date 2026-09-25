import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeListStaff } from '../../../application/staff/listStaff/executeListStaff';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('listStaff', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/staff',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;

      const result = await executeListStaff({ shopId }, request);

      return mapResultToHttp(result);
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
