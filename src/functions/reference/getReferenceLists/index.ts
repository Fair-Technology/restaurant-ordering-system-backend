import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetReferenceLists } from '../../../application/reference/getReferenceLists/executeGetReferenceLists';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('getReferenceLists', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'reference-lists/{countryCode}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const countryCode = request.params.countryCode;
    const result = await executeGetReferenceLists({ countryCode });
    return mapResultToHttp(result);
  },
});
