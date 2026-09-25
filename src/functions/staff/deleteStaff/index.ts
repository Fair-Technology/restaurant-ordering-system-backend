import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeDeleteStaff } from '../../../application/staff/deleteStaff/executeDeleteStaff';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('deleteStaff', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/staff/{staffId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const staffId = request.params.staffId;

      const result = await executeDeleteStaff({ shopId, staffId }, request);

      return mapResultToHttp(result);
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
