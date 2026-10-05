import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetOrderDocument } from '../../../application/order/invoices/executeGetOrderDocument';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('getOrderDocument', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/orders/{orderId}/documents/{documentId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const { shopId, orderId, documentId } = request.params;
      return mapResultToHttp(await executeGetOrderDocument({ shopId, orderId, documentId }, request));
    } catch {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
