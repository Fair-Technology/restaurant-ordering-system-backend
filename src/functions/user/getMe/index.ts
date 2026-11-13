import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetMe } from '../../../application/user/getMe/executeGetMe';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getMe', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'users/me',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const result = await executeGetMe(request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('getMe', error);
    }
  },
});
