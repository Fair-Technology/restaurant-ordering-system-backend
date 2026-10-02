import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetDpaDocument } from '../../../application/legal/getDpaDocument/executeGetDpaDocument';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('getDpaDocument', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'legal/dpa',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const result = await executeGetDpaDocument({ version: request.query.get('version') });
    return mapResultToHttp(result);
  },
});
