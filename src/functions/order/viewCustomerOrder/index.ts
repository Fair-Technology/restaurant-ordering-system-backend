import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetCustomerOrder } from '../../../application/order/customer/executeGetCustomerOrder';
import { BODY_NOT_OBJECT_ERROR } from '../../../domain/order/orderErrors';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { readJsonObject } from '../../_shared/readJsonObject';

app.http('viewCustomerOrder', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'customer-orders/{orderId}/view',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await readJsonObject(request);
      if (!body) return { status: 400, jsonBody: { error: BODY_NOT_OBJECT_ERROR } };
      return mapResultToHttp(await executeGetCustomerOrder({ orderId: request.params.orderId, token: body.token }));
    } catch {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
