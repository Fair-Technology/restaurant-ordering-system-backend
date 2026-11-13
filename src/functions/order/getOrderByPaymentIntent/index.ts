import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { getOrderByPaymentIntent } from '../../../application/order/getOrderByPaymentIntent/getOrderByPaymentIntent';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';

app.http('getOrderByPaymentIntent', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'orders/by-payment-intent/{paymentIntentId}',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const paymentIntentId = request.params.paymentIntentId;
      const result = await getOrderByPaymentIntent(paymentIntentId, request);
      return mapResultToHttp(result);
    } catch (error) {
      return internalServerError('getOrderByPaymentIntent', error);
    }
  },
});
