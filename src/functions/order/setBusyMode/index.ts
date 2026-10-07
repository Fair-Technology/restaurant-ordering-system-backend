import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { executeSetBusyMode } from '../../../application/order/intake/executeSetBusyMode';
import { BODY_NOT_OBJECT_ERROR } from '../../../domain/order/orderErrors';
import { mapResultToHttp } from '../../_shared/mapResultToHttp';
import { readJsonObject } from '../../_shared/readJsonObject';

app.http('setBusyMode', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'shops/{shopId}/busy-mode',
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await readJsonObject(request);
      if (!body) return { status: 400, jsonBody: { error: BODY_NOT_OBJECT_ERROR } };
      return mapResultToHttp(await executeSetBusyMode({ shopId: request.params.shopId, on: body.on }, request));
    } catch {
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
