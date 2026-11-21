import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetStaffMe } from '../../../application/staff/getStaffMe/executeGetStaffMe';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getStaffMe', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'staff/me',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const result = await executeGetStaffMe(request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('getStaffMe', error);
    }
  },
});
