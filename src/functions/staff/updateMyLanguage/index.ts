import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdateMyStaffLanguage } from '../../../application/staff/updateMyLanguage/executeUpdateMyStaffLanguage';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('updateMyStaffLanguage', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'staff/me/language',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      const result = await executeUpdateMyStaffLanguage({ language: body.language as any }, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('updateMyStaffLanguage', error);
    }
  },
});
