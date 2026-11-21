import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdateMyLanguage } from '../../../application/user/updateMyLanguage/executeUpdateMyLanguage';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('updateMyLanguage', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'users/me/language',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      const result = await executeUpdateMyLanguage({ language: body.language as any }, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('updateMyLanguage', error);
    }
  },
});
