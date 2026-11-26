import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdateSystemConfig } from '../../../application/systemConfig/updateSystemConfig/executeUpdateSystemConfig';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('updateSystemConfig', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'platform/config',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      const result = await executeUpdateSystemConfig(
        { maxShopsDefault: body.maxShopsDefault as number | undefined, emailEnabled: body.emailEnabled as boolean | undefined },
        request,
      );
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('updateSystemConfig', error);
    }
  },
});
