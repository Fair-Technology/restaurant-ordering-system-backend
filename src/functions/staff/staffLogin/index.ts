import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeStaffLogin } from '../../../application/staff/staffLogin/executeStaffLogin';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('staffLogin', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'staff/login',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = (await request.json()) as any;

      const result = await executeStaffLogin(body);

      return mapResultToHttp(result);
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
