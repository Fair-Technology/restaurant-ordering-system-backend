import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeCheckout } from '../../../application/order/checkout/executeCheckout';
import { CheckoutRequestDto } from '../../../application/order/checkout/dtos';
import { BODY_NOT_OBJECT_ERROR } from '../../../domain/order/orderErrors';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';

app.http('checkout', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'orders',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body: unknown = await request.json().catch(() => null);
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return { status: 400, jsonBody: { error: BODY_NOT_OBJECT_ERROR } };
      }
      const result = await executeCheckout(body as CheckoutRequestDto);
      return mapResultToHttp(result);
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
