import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdatePlatformLegalIdentity } from '../../../application/legal/updatePlatformLegalIdentity/executeUpdatePlatformLegalIdentity';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('updatePlatformLegalIdentity', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'platform/legal-identity',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await request.json();
      const result = await executeUpdatePlatformLegalIdentity({ body }, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('updatePlatformLegalIdentity', error);
    }
  },
});
