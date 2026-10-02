import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeEraseCustomer } from '../../../application/legal/eraseCustomer/executeEraseCustomer';
import { EraseCustomerBody } from '../../../application/legal/dtos';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('eraseCustomer', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/customer-erasure',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const body = (await request.json()) as Partial<EraseCustomerBody> | null;
    const result = await executeEraseCustomer({ shopId: request.params.shopId, email: body?.email }, request);
    return mapResultToHttp(result);
  },
});
