import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeCreateStaff } from '../../../application/staff/createStaff/executeCreateStaff';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('createStaff', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/staff',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const shopId = request.params.shopId;
      const body = (await request.json()) as any;

      const result = await executeCreateStaff({ ...body, shopId }, request);

      return mapResultToHttp(result);
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
