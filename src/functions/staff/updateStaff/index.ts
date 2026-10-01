import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdateStaff } from '../../../application/staff/updateStaff/executeUpdateStaff';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('updateStaff', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/staff/{staffId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const staffId = request.params.staffId;
      const body = (await request.json()) as any;

      const result = await executeUpdateStaff({ ...body, shopId, staffId }, request);

      return mapResultToHttp(result);
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
