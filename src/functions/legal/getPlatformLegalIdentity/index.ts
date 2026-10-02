import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetPlatformLegalIdentity } from '../../../application/legal/getPlatformLegalIdentity/executeGetPlatformLegalIdentity';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('getPlatformLegalIdentity', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'platform/legal-identity',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const result = await executeGetPlatformLegalIdentity(request);
    return mapResultToHttp(result);
  },
});
