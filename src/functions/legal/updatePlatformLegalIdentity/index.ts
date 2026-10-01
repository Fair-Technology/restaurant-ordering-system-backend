import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdatePlatformLegalIdentity } from '../../../application/legal/updatePlatformLegalIdentity/executeUpdatePlatformLegalIdentity';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('updatePlatformLegalIdentity', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'platform/legal-identity',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const body = await request.json();
    const result = await executeUpdatePlatformLegalIdentity({ body }, request);
    return mapResultToHttp(result);
  },
});
