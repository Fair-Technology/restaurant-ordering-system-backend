import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeSubscribePush } from '../../../application/order/push/executeSubscribePush';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { internalServerError } from '../../_shared/internalServerError';
import { BODY_NOT_OBJECT_ERROR } from '../../../domain/order/orderErrors';
import { readJsonObject } from '../../_shared/readJsonObject';

app.http('subscribePush', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/push/subscriptions',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await readJsonObject(request);
      if (!body) return { status: 400, jsonBody: { error: BODY_NOT_OBJECT_ERROR } };
      return mapResultToHttp(await executeSubscribePush({ ...body, shopId: request.params.shopId }, request));
    } catch (error) {
      return internalServerError('subscribePush', error);
    }
  },
});
