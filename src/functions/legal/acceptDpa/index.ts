import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeAcceptDpa } from '../../../application/legal/acceptDpa/executeAcceptDpa';
import { AcceptDpaBody } from '../../../application/legal/dtos';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('acceptDpa', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/dpa-acceptance',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const body = (await request.json()) as Partial<AcceptDpaBody> | null;
    const result = await executeAcceptDpa({ shopId: request.params.shopId, version: String(body?.version ?? '') }, request);
    return mapResultToHttp(result);
  },
});
