import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeCancelCustomerOrder } from '../../../application/order/customer/executeCancelCustomerOrder';
import { BODY_NOT_OBJECT_ERROR } from '../../../domain/order/orderErrors';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { readJsonObject } from '../../_shared/readJsonObject';

app.http('cancelCustomerOrder', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'customer-orders/{orderId}/cancel',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await readJsonObject(request);
      if (!body) return { status: 400, jsonBody: { error: BODY_NOT_OBJECT_ERROR } };
      return mapResultToHttp(await executeCancelCustomerOrder({ orderId: request.params.orderId, token: body.token }));
    } catch {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
