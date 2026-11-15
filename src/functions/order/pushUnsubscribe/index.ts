import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeUnsubscribePush } from '../../../application/order/push/executeUnsubscribePush';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';
import { BODY_NOT_OBJECT_ERROR } from '../../../domain/order/orderErrors';
import { readJsonObject } from '../../_shared/readJsonObject';

app.http('unsubscribePush', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/push/subscriptions',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await readJsonObject(request);
      if (!body) return { status: 400, jsonBody: { error: BODY_NOT_OBJECT_ERROR } };
      return mapResultToHttp(await executeUnsubscribePush({ ...body, shopId: request.params.shopId }, request));
    } catch (error) {
      return internalServerError('unsubscribePush', error);
    }
  },
});
