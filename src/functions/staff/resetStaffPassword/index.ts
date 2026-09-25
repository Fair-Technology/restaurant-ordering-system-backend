import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeResetStaffPassword } from '../../../application/staff/resetStaffPassword/executeResetStaffPassword';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('resetStaffPassword', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/staff/{staffId}/password',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const staffId = request.params.staffId;
      const body = (await request.json()) as any;

      const result = await executeResetStaffPassword({ ...body, shopId, staffId }, request);

      return mapResultToHttp(result);
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
