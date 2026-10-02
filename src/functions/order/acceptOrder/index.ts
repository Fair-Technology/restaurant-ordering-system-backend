import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeAcceptOrder } from '../../../application/order/intake/executeAcceptOrder';
import { BODY_NOT_OBJECT_ERROR } from '../../../domain/order/orderErrors';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { readJsonObject } from '../../_shared/readJsonObject';

app.http('acceptOrder', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/orders/{orderId}/accept',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await readJsonObject(request, { emptyAllowed: true });
      if (!body) return { status: 400, jsonBody: { error: BODY_NOT_OBJECT_ERROR } };
      const { shopId, orderId } = request.params;
      return mapResultToHttp(await executeAcceptOrder({ ...body, shopId, orderId }, request));
    } catch {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
