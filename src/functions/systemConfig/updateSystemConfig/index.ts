import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdateSystemConfig } from '../../../application/systemConfig/updateSystemConfig/executeUpdateSystemConfig';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('updateSystemConfig', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'platform/config',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await executeUpdateSystemConfig(
      { maxShopsDefault: body.maxShopsDefault as number },
      request,
    );
    return mapResultToHttp(result);
  },
});
