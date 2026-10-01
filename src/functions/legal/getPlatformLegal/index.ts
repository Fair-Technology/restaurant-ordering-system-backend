import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetPlatformLegal } from '../../../application/legal/getPlatformLegal/executeGetPlatformLegal';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('getPlatformLegal', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'legal/platform',
  handler: async (_request: HttpRequest): Promise<HttpResponseInit> => {
    const result = await executeGetPlatformLegal();
    return mapResultToHttp(result);
  },
});
