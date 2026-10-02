import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeQuoteBasket } from '../../../application/order/quoteBasket/executeQuoteBasket';
import { BODY_NOT_OBJECT_ERROR } from '../../../domain/order/orderErrors';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('quoteBasket', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'orders/quote',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body: unknown = await request.json().catch(() => null);
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return { status: 400, jsonBody: { error: BODY_NOT_OBJECT_ERROR } };
      }
      return mapResultToHttp(await executeQuoteBasket(body as Parameters<typeof executeQuoteBasket>[0]));
    } catch {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
