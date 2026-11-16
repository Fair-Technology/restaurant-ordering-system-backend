import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdateReferenceLists } from '../../../application/reference/updateReferenceLists/executeUpdateReferenceLists';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('updateReferenceLists', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'platform/reference-lists/{countryCode}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const countryCode = request.params.countryCode;
      const body = await request.json();
      const result = await executeUpdateReferenceLists({ countryCode, body }, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('updateReferenceLists', error);
    }
  },
});
