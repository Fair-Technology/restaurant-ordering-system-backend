import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUpdateReferenceLists } from '../../../application/reference/updateReferenceLists/executeUpdateReferenceLists';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('updateReferenceLists', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'admin/reference-lists/{countryCode}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const countryCode = request.params.countryCode;
    const body = await request.json();
    const result = await executeUpdateReferenceLists({ countryCode, body }, request);
    return mapResultToHttp(result);
  },
});
