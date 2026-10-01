import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetSystemConfig } from '../../../application/systemConfig/getSystemConfig/executeGetSystemConfig';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('getSystemConfig', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'platform/config',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const result = await executeGetSystemConfig(request);
    return mapResultToHttp(result);
  },
});
