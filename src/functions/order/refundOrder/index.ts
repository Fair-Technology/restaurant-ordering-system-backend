import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeRefundOrder } from '../../../application/order/refunds/executeRefundOrder';
import { BODY_NOT_OBJECT_ERROR } from '../../../domain/order/orderErrors';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { readJsonObject } from '../../_shared/readJsonObject';

app.http('refundOrder', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/orders/{orderId}/refunds',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await readJsonObject(request);
      if (!body) return { status: 400, jsonBody: { error: BODY_NOT_OBJECT_ERROR } };
      const { shopId, orderId } = request.params;
      return mapResultToHttp(await executeRefundOrder({ ...body, shopId, orderId }, request));
    } catch {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
