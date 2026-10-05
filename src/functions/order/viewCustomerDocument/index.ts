import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeGetCustomerDocument } from '../../../application/order/invoices/executeGetOrderDocument';
import { BODY_NOT_OBJECT_ERROR } from '../../../domain/order/orderErrors';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { readJsonObject } from '../../_shared/readJsonObject';

app.http('viewCustomerDocument', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'customer-orders/{orderId}/documents/{documentId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await readJsonObject(request);
      if (!body) return { status: 400, jsonBody: { error: BODY_NOT_OBJECT_ERROR } };
      const { orderId, documentId } = request.params;
      return mapResultToHttp(await executeGetCustomerDocument({ orderId, documentId, token: body.token }));
    } catch {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
